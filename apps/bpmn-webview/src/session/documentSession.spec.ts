import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";

import {
    BpmnFileQuery,
    type Command,
    createInertLockGroup,
    FlushDocumentQuery,
    FocusElementQuery,
    isMessageOfType,
    LanguageQuery,
    type MessageOfType,
    type ProtocolMessageType,
    type Query,
    ReleaseDocumentFlushQuery,
} from "@miragon/bpmn-modeler-shared";

import {
    type BpmnDocumentSurface,
    BpmnDocumentSession,
    type BpmnPageLifecycle,
} from "./documentSession";

function deferred<T = void>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((onResolve, onReject) => {
        resolve = onResolve;
        reject = onReject;
    });
    return { promise, resolve, reject };
}

type SurfaceFake = { [Method in keyof BpmnDocumentSurface]: Mock<BpmnDocumentSurface[Method]> };
type PageFake = { [Method in keyof BpmnPageLifecycle]: Mock<BpmnPageLifecycle[Method]> };

function makeSurface(overrides: Partial<SurfaceFake> = {}): SurfaceFake {
    return {
        importDocument: vi.fn(async (_content: string | undefined) => {}),
        exportDocument: vi.fn(async () => "<exported />"),
        afterSync: vi.fn(),
        hasPendingInput: vi.fn(() => false),
        flushPendingInput: vi.fn(),
        refreshDiagram: vi.fn(async () => {}),
        centerOnElement: vi.fn(),
        ...overrides,
    };
}

function makePage(): PageFake {
    return {
        cancelPendingSurfaceWork: vi.fn(),
        flushViewport: vi.fn(),
        destroySurface: vi.fn(),
        reloadPage: vi.fn(),
    };
}

// Like the real translator, setLanguage falls back to "en" for a code it does not know.
function makeTranslator() {
    let locale = "en";
    return {
        getLocale: vi.fn(() => locale),
        setLanguage: vi.fn((requested: string) => {
            locale = requested === "xx" ? "en" : requested;
        }),
    };
}

function setup(surfaceOverrides: Partial<SurfaceFake> = {}) {
    const posted: (Command | Query)[] = [];
    const surface = makeSurface(surfaceOverrides);
    const page = makePage();
    const translator = makeTranslator();
    const session = new BpmnDocumentSession(
        { postMessage: (m) => posted.push(m) },
        { surface, page, translator, pageInertLocks: createInertLockGroup(document.body) },
    );
    return { session, surface, page, translator, posted };
}

// Applying the held value edits the diagram, as the panel's modeling command does.
function holdPanelInput(context: ReturnType<typeof setup>, typed: string): void {
    let panelInput: string | undefined = typed;
    context.surface.hasPendingInput.mockImplementation(() => panelInput !== undefined);
    context.surface.flushPendingInput.mockImplementation(() => {
        if (panelInput === undefined) return;
        context.surface.exportDocument.mockResolvedValue(panelInput);
        panelInput = undefined;
        context.session.scheduleSync();
    });
}

const hostFile = (content: string, revision: number, engine: "c7" | "c8" | undefined = "c7") =>
    new BpmnFileQuery(content, engine, "modeler", revision);

/** Opens the initial document but leaves the session short of initialized, as mid-boot. */
async function importInitialFile(setupResult: ReturnType<typeof setup>, revision = 1) {
    const { session } = setupResult;
    void session.receiveHostFile(hostFile("<initial />", revision));
    const first = await session.waitForInitialHostFile();
    await session.openInitialDocument(first);
}

async function openSession(setupResult: ReturnType<typeof setup>, revision = 1) {
    await importInitialFile(setupResult, revision);
    setupResult.session.markInitialized();
}

async function pushHostFile(session: BpmnDocumentSession, file: BpmnFileQuery): Promise<void> {
    const received = session.receiveHostFile(file);
    await vi.advanceTimersByTimeAsync(100);
    await received;
}

const postedOfType = <TType extends ProtocolMessageType>(
    posted: (Command | Query)[],
    type: TType,
) => posted.filter((message): message is MessageOfType<TType> => isMessageOfType(message, type));

const syncCommands = (posted: (Command | Query)[]) => postedOfType(posted, "SyncDocumentCommand");

const loggedErrors = (posted: (Command | Query)[]) =>
    postedOfType(posted, "LogErrorCommand").map((log) => log.message);

const callOrder = (fn: { mock: { invocationCallOrder: number[] } }, call = 0) =>
    fn.mock.invocationCallOrder[call];

describe("BpmnDocumentSession", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        document.body.inert = false;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe("initial import", () => {
        it("hands the first host file to the boot and imports it at its revision", async () => {
            const context = setup();

            await openSession(context, 4);

            expect(context.surface.importDocument).toHaveBeenCalledWith("<initial />");
            expect(context.session.document.documentRevision()).toBe(4);
            expect(context.session.isReady()).toBe(true);
        });

        it("hands only the first host file to the boot", async () => {
            const context = setup();
            const first = hostFile("<first />", 1);

            await context.session.receiveHostFile(first);
            await context.session.receiveHostFile(hostFile("<second />", 2));

            await expect(context.session.waitForInitialHostFile()).resolves.toBe(first);
            expect(context.session.latestHostFile?.content).toBe("<second />");
        });

        it("opens only the newest host file when one overtook the initial reply", async () => {
            const context = setup();
            void context.session.receiveHostFile(hostFile("<initial />", 1));
            const first = await context.session.waitForInitialHostFile();
            await context.session.receiveHostFile(hostFile("<newer />", 2));

            await expect(context.session.openInitialDocument(first)).resolves.toBe(true);

            expect(context.surface.importDocument).toHaveBeenCalledExactlyOnceWith("<newer />");
            expect(context.session.document.documentRevision()).toBe(2);
        });

        it("imports a host push that arrived during the initial import right after it", async () => {
            const initialImport = deferred();
            const context = setup();
            vi.mocked(context.surface.importDocument).mockImplementationOnce(
                () => initialImport.promise,
            );
            void context.session.receiveHostFile(hostFile("<initial />", 1));

            const opening = context.session.openInitialDocument(
                await context.session.waitForInitialHostFile(),
            );
            await context.session.receiveHostFile(hostFile("<pushed />", 2));
            initialImport.resolve();
            await vi.runAllTimersAsync();

            expect(await opening).toBe(true);
            expect(context.surface.importDocument).toHaveBeenLastCalledWith("<pushed />");
            expect(context.session.document.documentRevision()).toBe(2);
        });

        it("keeps the initial document when the update queued behind it cannot be opened", async () => {
            const initialImport = deferred();
            const context = setup();
            context.surface.importDocument
                .mockImplementationOnce(() => initialImport.promise)
                .mockRejectedValueOnce(new Error("broken update"));
            void context.session.receiveHostFile(hostFile("<initial />", 1));

            const opening = context.session.openInitialDocument(
                await context.session.waitForInitialHostFile(),
            );
            await context.session.receiveHostFile(hostFile("<broken />", 2));
            initialImport.resolve();
            await vi.runAllTimersAsync();

            expect(await opening).toBe(true);
            expect(context.surface.importDocument).toHaveBeenLastCalledWith("<broken />");
            expect(loggedErrors(context.posted)).toEqual([
                "Unable to open host XML\nbroken update",
            ]);
        });

        it("falls back to a newer host file when the initial one cannot be opened", async () => {
            const initialImport = deferred();
            const context = setup();
            context.surface.importDocument.mockImplementationOnce(async () => {
                await initialImport.promise;
                throw new Error("invalid initial document");
            });
            void context.session.receiveHostFile(hostFile("<invalid />", 1));

            const opening = context.session.openInitialDocument(
                await context.session.waitForInitialHostFile(),
            );
            await context.session.receiveHostFile(hostFile("<valid />", 2));
            initialImport.resolve();

            expect(await opening).toBe(true);
            expect(context.surface.importDocument).toHaveBeenLastCalledWith("<valid />");
            expect(context.session.document.documentRevision()).toBe(2);
            expect(loggedErrors(context.posted)).toEqual([
                "Unable to open host XML\ninvalid initial document",
            ]);
        });

        it("gives up on an initial host file that cannot be opened and ignores later pushes", async () => {
            const context = setup();
            context.surface.importDocument.mockRejectedValue(new Error("not BPMN"));
            void context.session.receiveHostFile(hostFile("<broken />", 1));

            const proceed = await context.session.openInitialDocument(
                await context.session.waitForInitialHostFile(),
            );
            await pushHostFile(context.session, hostFile("<later />", 2));

            expect(proceed).toBe(false);
            expect(loggedErrors(context.posted)).toEqual(["Unable to open XML\nnot BPMN"]);
            expect(context.surface.importDocument).toHaveBeenCalledOnce();
        });

        it.each([
            ["a C8", "c8", "c7"],
            ["an untagged", undefined, "c8"],
        ] as const)(
            "keeps %s initial file's engine for later pushes",
            async (_case, initialEngine, otherEngine) => {
                const context = setup();
                void context.session.receiveHostFile(hostFile("<initial />", 1, initialEngine));
                await expect(
                    context.session.openInitialDocument(
                        await context.session.waitForInitialHostFile(),
                    ),
                ).resolves.toBe(true);

                await pushHostFile(context.session, hostFile("<same engine />", 2, initialEngine));
                expect(context.surface.importDocument).toHaveBeenLastCalledWith("<same engine />");
                expect(context.page.reloadPage).not.toHaveBeenCalled();

                await pushHostFile(context.session, hostFile("<other engine />", 3, otherEngine));
                expect(context.page.reloadPage).toHaveBeenCalledOnce();
            },
        );

        it("reloads instead of opening a newest host file for another engine", async () => {
            const context = setup();
            void context.session.receiveHostFile(hostFile("<c7 />", 1));
            const first = await context.session.waitForInitialHostFile();
            await context.session.receiveHostFile(hostFile("<c8 />", 2, "c8"));

            await expect(context.session.openInitialDocument(first)).resolves.toBe(false);

            expect(context.page.reloadPage).toHaveBeenCalledOnce();
            expect(context.surface.importDocument).not.toHaveBeenCalled();
        });

        it("reloads when the update queued behind the initial import targets another engine", async () => {
            const initialImport = deferred();
            const context = setup();
            context.surface.importDocument.mockImplementationOnce(() => initialImport.promise);
            void context.session.receiveHostFile(hostFile("<c7 />", 1));

            const opening = context.session.openInitialDocument(
                await context.session.waitForInitialHostFile(),
            );
            await context.session.receiveHostFile(hostFile("<c8 />", 2, "c8"));
            initialImport.resolve();

            await expect(opening).resolves.toBe(false);
            expect(context.surface.importDocument).toHaveBeenCalledExactlyOnceWith("<c7 />");
            expect(context.page.reloadPage).toHaveBeenCalledOnce();
        });

        it("stops the boot when another engine arrives while a queued update waits to import", async () => {
            const initialImport = deferred();
            const context = setup();
            context.surface.importDocument.mockImplementationOnce(() => initialImport.promise);
            void context.session.receiveHostFile(hostFile("<initial />", 1));

            const opening = context.session.openInitialDocument(
                await context.session.waitForInitialHostFile(),
            );
            await context.session.receiveHostFile(hostFile("<queued />", 2));
            initialImport.resolve();
            await vi.advanceTimersByTimeAsync(0);
            expect(context.session.document.hasPendingHostUpdate()).toBe(true);
            await context.session.receiveHostFile(hostFile("<c8 />", 3, "c8"));

            await expect(opening).resolves.toBe(false);
            expect(context.surface.importDocument).toHaveBeenCalledExactlyOnceWith("<initial />");
            expect(context.page.reloadPage).toHaveBeenCalledOnce();
        });
    });

    describe("host pushes", () => {
        it("ignores a host file older than the latest one", async () => {
            const context = setup();
            await openSession(context, 5);

            await context.session.receiveHostFile(hostFile("<old />", 3));
            await vi.runAllTimersAsync();

            expect(context.surface.importDocument).not.toHaveBeenCalledWith("<old />");
            expect(context.session.document.hostUpdateVersion()).toBe(1);
        });

        it("imports every push from a host that sends no revisions", async () => {
            const context = setup();
            void context.session.receiveHostFile(new BpmnFileQuery("<first />", "c7"));
            await context.session.openInitialDocument(
                await context.session.waitForInitialHostFile(),
            );
            context.session.markInitialized();

            await pushHostFile(context.session, new BpmnFileQuery("<second />", "c7"));

            expect(context.surface.importDocument.mock.calls).toEqual([
                ["<first />"],
                ["<second />"],
            ]);
        });

        it("keeps the pending edit when it ignores a stale push", async () => {
            const context = setup();
            await openSession(context, 3);

            context.session.scheduleSync();
            await pushHostFile(context.session, hostFile("<stale />", 2));
            await vi.advanceTimersByTimeAsync(300);

            expect(context.surface.importDocument).toHaveBeenCalledOnce();
            expect(syncCommands(context.posted)).toEqual([
                expect.objectContaining({ documentRevision: 3 }),
            ]);
        });

        it("cancels a pending local sync when the host pushes", async () => {
            const context = setup();
            await openSession(context);

            context.session.scheduleSync();
            const pushed = context.session.receiveHostFile(hostFile("<pushed />", 2));
            await vi.runAllTimersAsync();
            await pushed;

            expect(context.surface.exportDocument).not.toHaveBeenCalled();
        });

        it("drops a pending edit even when the push arrives before host updates are imported", async () => {
            const context = setup();
            void context.session.receiveHostFile(hostFile("<initial />", 1));
            await context.session.waitForInitialHostFile();

            context.session.scheduleSync();
            await context.session.receiveHostFile(hostFile("<held />", 2));
            await vi.advanceTimersByTimeAsync(300);

            expect(context.surface.exportDocument).not.toHaveBeenCalled();
            expect(context.surface.importDocument).not.toHaveBeenCalled();
        });

        it("runs the deferred actions after a push only once the session is initialized", async () => {
            const context = setup();
            await importInitialFile(context);
            await context.session.focusElement("Task_1");

            await pushHostFile(context.session, hostFile("<before initialized />", 2));
            expect(context.surface.centerOnElement).not.toHaveBeenCalled();

            context.session.markInitialized();
            await pushHostFile(context.session, hostFile("<after initialized />", 3));

            expect(context.surface.centerOnElement).toHaveBeenCalledExactlyOnceWith("Task_1");
            expect(context.surface.importDocument.mock.invocationCallOrder.at(-1)).toBeLessThan(
                callOrder(context.surface.centerOnElement),
            );
        });

        it("still runs the deferred actions when a push cannot be imported", async () => {
            const context = setup();
            await importInitialFile(context);
            await context.session.focusElement("Task_1");
            context.session.markInitialized();
            context.surface.importDocument.mockRejectedValueOnce(new Error("broken push"));

            const received = context.session
                .receiveHostFile(hostFile("<broken />", 2))
                .catch((error: unknown) => error);
            await vi.advanceTimersByTimeAsync(100);

            await expect(received).resolves.toEqual(new Error("broken push"));
            expect(context.surface.centerOnElement).toHaveBeenCalledExactlyOnceWith("Task_1");
        });

        it("keeps the last represented revision when a push cannot be imported", async () => {
            const context = setup();
            await openSession(context);
            context.surface.importDocument.mockRejectedValueOnce(new Error("broken push"));
            const received = context.session
                .receiveHostFile(hostFile("<broken />", 2))
                .catch(() => undefined);
            await vi.advanceTimersByTimeAsync(100);
            await received;

            context.session.scheduleSync();
            await vi.advanceTimersByTimeAsync(300);

            expect(context.session.document.documentRevision()).toBe(1);
            expect(syncCommands(context.posted)).toEqual([
                expect.objectContaining({ documentRevision: 1 }),
            ]);
        });

        it("does not claim the revision of an import a newer push overtook", async () => {
            const overtakenImport = deferred();
            const context = setup();
            await openSession(context);
            const revisionsSeenByImports: number[] = [];
            context.surface.importDocument.mockImplementation(async (content) => {
                revisionsSeenByImports.push(context.session.document.documentRevision());
                if (content === "<overtaken />") await overtakenImport.promise;
            });

            const overtaken = context.session.receiveHostFile(hostFile("<overtaken />", 2));
            await vi.advanceTimersByTimeAsync(100);
            const newest = context.session.receiveHostFile(hostFile("<newest />", 3));
            overtakenImport.resolve();
            await vi.runAllTimersAsync();
            await Promise.all([overtaken, newest]);

            expect(revisionsSeenByImports).toEqual([1, 1]);
            expect(context.session.document.documentRevision()).toBe(3);
        });

        it("reports a failing queued update and keeps draining the newer one", async () => {
            const brokenImport = deferred();
            const context = setup();
            await openSession(context);
            context.surface.importDocument.mockImplementationOnce(async () => {
                await brokenImport.promise;
                throw new Error("broken push");
            });

            const broken = context.session
                .receiveHostFile(hostFile("<broken />", 2))
                .catch((error: unknown) => error);
            await vi.advanceTimersByTimeAsync(100);
            const newest = context.session.receiveHostFile(hostFile("<newest />", 3));
            const focused = context.session.focusElement("Task_1");
            brokenImport.resolve();
            await Promise.all([broken, newest, focused]);

            expect(await broken).toEqual(new Error("broken push"));
            expect(context.session.document.hasPendingHostUpdate()).toBe(false);
            expect(context.surface.importDocument).toHaveBeenLastCalledWith("<newest />");
            expect(context.session.document.documentRevision()).toBe(3);
            expect(loggedErrors(context.posted)).toEqual(["Unable to open host XML\nbroken push"]);
            expect(context.surface.importDocument.mock.invocationCallOrder.at(-1)).toBeLessThan(
                callOrder(context.surface.centerOnElement),
            );
        });

        it("reloads the webview when a host push changes the engine", async () => {
            const context = setup();
            await openSession(context);

            await context.session.receiveHostFile(hostFile("<c8 />", 2, "c8"));

            expect(context.session.isReloadingForEngine).toBe(true);
            expect(context.session.isReady()).toBe(false);
            expect(context.page.destroySurface).toHaveBeenCalledOnce();
            expect(context.page.reloadPage).toHaveBeenCalledOnce();
            expect(context.surface.importDocument).not.toHaveBeenCalledWith("<c8 />");
            expect(document.body.inert).toBe(true);
        });
    });

    describe("exclusive operations", () => {
        it("queues a host push that arrives during an exclusive operation and replays it afterwards", async () => {
            const context = setup();
            await openSession(context);
            const modeSwitch = deferred();
            void context.session.runExclusive(() => modeSwitch.promise);

            const pushed = context.session.receiveHostFile(hostFile("<pushed />", 2));
            await vi.advanceTimersByTimeAsync(500);
            expect(context.surface.importDocument).not.toHaveBeenCalledWith("<pushed />");

            modeSwitch.resolve();
            await vi.runAllTimersAsync();
            await pushed;

            expect(context.surface.importDocument).toHaveBeenLastCalledWith("<pushed />");
            expect(context.session.document.documentRevision()).toBe(2);
        });

        it("runs an exclusive operation only after the host import ahead of it", async () => {
            const pushImport = deferred();
            const context = setup();
            await openSession(context);
            context.surface.importDocument.mockImplementationOnce(() => pushImport.promise);
            const switchMode = vi.fn(async () => {});

            const pushed = context.session.receiveHostFile(hostFile("<pushed />", 2));
            await vi.advanceTimersByTimeAsync(100);
            const switching = context.session.runExclusive(switchMode);
            await vi.advanceTimersByTimeAsync(0);
            expect(switchMode).not.toHaveBeenCalled();

            pushImport.resolve();
            await Promise.all([pushed, switching]);

            expect(switchMode).toHaveBeenCalledOnce();
        });

        it("refreshes the diagram only after the exclusive operation ahead of it", async () => {
            const context = setup();
            await openSession(context);
            const modeSwitch = deferred();
            void context.session.runExclusive(() => modeSwitch.promise);

            const refreshing = context.session.applyLanguage("de");
            await vi.advanceTimersByTimeAsync(0);
            expect(context.surface.refreshDiagram).not.toHaveBeenCalled();

            modeSwitch.resolve();
            await refreshing;

            expect(context.surface.refreshDiagram).toHaveBeenCalledOnce();
        });

        it("runs the next operation even when the one ahead of it failed", async () => {
            const context = setup();
            await openSession(context);
            const nextOperation = vi.fn(async () => {});

            const failing = expect(
                context.session.runExclusive(async () => {
                    throw new Error("switch broke");
                }),
            ).rejects.toThrow("switch broke");
            await context.session.runExclusive(nextOperation);

            await failing;
            expect(nextOperation).toHaveBeenCalledOnce();
        });
    });

    describe("outbound sync", () => {
        it("syncs a local change at the represented revision", async () => {
            const context = setup();
            await openSession(context, 3);

            context.session.scheduleSync();
            await vi.runAllTimersAsync();

            expect(syncCommands(context.posted)).toEqual([
                expect.objectContaining({ content: "<exported />", documentRevision: 3 }),
            ]);
            expect(context.surface.afterSync).toHaveBeenCalledOnce();
        });

        it("runs the after-sync step only once the sync reached the host", async () => {
            const context = setup();
            await openSession(context);
            const syncsPostedBeforeAfterSync: number[] = [];
            context.surface.afterSync.mockImplementation(() => {
                syncsPostedBeforeAfterSync.push(syncCommands(context.posted).length);
            });

            context.session.scheduleSync();
            await vi.advanceTimersByTimeAsync(300);

            expect(syncsPostedBeforeAfterSync).toEqual([1]);
        });

        it("drops an export that a host push overtook", async () => {
            const exportStarted = deferred();
            const exportResult = deferred();
            const context = setup({
                exportDocument: vi.fn(async () => {
                    exportStarted.resolve();
                    await exportResult.promise;
                    return "<stale />";
                }),
            });
            await openSession(context);

            context.session.scheduleSync();
            await vi.advanceTimersByTimeAsync(300);
            await exportStarted.promise;
            await pushHostFile(context.session, hostFile("<pushed />", 2));
            // The push has imported, so only the revision check can drop the export.
            expect(context.session.document.hasPendingHostUpdate()).toBe(false);
            exportResult.resolve();
            await vi.runAllTimersAsync();

            expect(syncCommands(context.posted)).toEqual([]);
            expect(context.surface.afterSync).not.toHaveBeenCalled();
            expect(context.session.document.documentRevision()).toBe(2);
        });

        it("drops an export while a host push waits to import", async () => {
            const context = setup();
            await openSession(context);

            void context.session.receiveHostFile(hostFile("<pushed />", 2));
            context.session.scheduleSync();
            await context.session.flushPendingSync();

            expect(context.surface.exportDocument).toHaveBeenCalledOnce();
            expect(syncCommands(context.posted)).toEqual([]);
        });

        it("reports an export that fails", async () => {
            const context = setup();
            await openSession(context);
            context.surface.exportDocument.mockRejectedValueOnce(new Error("export broke"));

            context.session.scheduleSync();
            await vi.advanceTimersByTimeAsync(300);

            expect(loggedErrors(context.posted)).toEqual([
                "Failed to sync diagram changes: export broke",
            ]);
            expect(context.surface.afterSync).not.toHaveBeenCalled();
        });

        it("syncs the edit an after-sync step schedules when it drains before a destroy", async () => {
            const context = setup();
            await openSession(context);
            context.surface.afterSync.mockImplementationOnce(() => context.session.scheduleSync());

            context.session.scheduleSync();
            await context.session.flushPendingSync();

            expect(syncCommands(context.posted)).toHaveLength(2);
            expect(context.session.document.hasPendingSync()).toBe(false);
        });

        it("lands every pending edit on the host before a surface destroy", async () => {
            const context = setup();
            await openSession(context, 4);
            context.surface.afterSync.mockImplementationOnce(() => context.session.scheduleSync());

            context.session.scheduleSync();
            await context.session.flushBeforeSurfaceDestroy();

            expect(syncCommands(context.posted)).toEqual([
                expect.objectContaining({ content: "<exported />", documentRevision: 4 }),
                expect.objectContaining({ content: "<exported />", documentRevision: 4 }),
            ]);
            expect(context.session.document.hasPendingSync()).toBe(false);
        });

        it("syncs no panel input the next surface's XML lacks before a destroy", async () => {
            const context = setup();
            await openSession(context);
            holdPanelInput(context, "<typed />");

            await context.session.flushBeforeSurfaceDestroy();

            expect(syncCommands(context.posted)).toEqual([]);
        });

        it("fires the scheduled sync only once when the page hides", async () => {
            const context = setup();
            await openSession(context);
            context.surface.afterSync.mockImplementationOnce(() => context.session.scheduleSync());

            context.session.scheduleSync();
            context.session.flushSyncOnHide();
            await vi.advanceTimersByTimeAsync(0);

            expect(syncCommands(context.posted)).toHaveLength(1);
            expect(context.session.document.hasPendingSync()).toBe(true);
        });
    });

    describe("flush handshake", () => {
        const flushReplies = (posted: (Command | Query)[]) =>
            postedOfType(posted, "DocumentFlushedCommand");

        it("answers a flush before the session is ready as unavailable", async () => {
            const context = setup();

            await context.session.handlers.FlushDocumentQuery(new FlushDocumentQuery(1));

            expect(flushReplies(context.posted)).toEqual([
                expect.objectContaining({ token: 1, status: "unavailable" }),
            ]);
        });

        it("exports a pending edit for a save at the represented revision", async () => {
            const context = setup();
            await openSession(context, 6);

            context.session.scheduleSync();
            await context.session.handlers.FlushDocumentQuery(new FlushDocumentQuery(2));

            expect(flushReplies(context.posted)).toEqual([
                expect.objectContaining({
                    token: 2,
                    status: "flushed",
                    content: "<exported />",
                    documentRevision: 6,
                }),
            ]);
        });

        it("reports a pending panel input as a pending sync", async () => {
            const context = setup();
            await openSession(context, 6);
            holdPanelInput(context, "<typed />");

            expect(context.session.document.hasPendingSync()).toBe(true);
            await context.session.handlers.FlushDocumentQuery(new FlushDocumentQuery(2));

            expect(flushReplies(context.posted)).toEqual([
                expect.objectContaining({
                    token: 2,
                    status: "flushed",
                    content: "<typed />",
                    documentRevision: 6,
                }),
            ]);
        });

        it("lets the host copy win a save while a host push waits to import", async () => {
            const context = setup();
            await openSession(context);

            void context.session.receiveHostFile(hostFile("<pushed />", 2));
            context.session.scheduleSync();
            await context.session.handlers.FlushDocumentQuery(new FlushDocumentQuery(4));

            expect(flushReplies(context.posted)).toEqual([
                expect.objectContaining({ token: 4, status: "host-updated" }),
            ]);
        });

        describe("recovery flush that may follow a dropped sync", () => {
            const recoveryFlush = (token: number) => new FlushDocumentQuery(token, true, true);

            it("leaves a page nobody edited since its last host render to the host", async () => {
                const context = setup();
                await openSession(context);

                await context.session.handlers.FlushDocumentQuery(recoveryFlush(5));

                expect(context.surface.exportDocument).not.toHaveBeenCalled();
                expect(flushReplies(context.posted)).toEqual([
                    expect.objectContaining({ token: 5, status: "clean" }),
                ]);
            });

            it("exports an edit whose sync already went out", async () => {
                const context = setup();
                await openSession(context, 3);
                context.session.scheduleSync();
                await vi.advanceTimersByTimeAsync(300);
                expect(syncCommands(context.posted)).toHaveLength(1);

                await context.session.handlers.FlushDocumentQuery(recoveryFlush(6));

                expect(flushReplies(context.posted)).toEqual([
                    expect.objectContaining({
                        token: 6,
                        status: "flushed",
                        content: "<exported />",
                        documentRevision: 3,
                    }),
                ]);
            });

            it("leaves a page to the host once a host render replaced its edit", async () => {
                const context = setup();
                await openSession(context);
                context.session.scheduleSync();
                await vi.advanceTimersByTimeAsync(300);
                await pushHostFile(context.session, hostFile("<rendered />", 2));

                await context.session.handlers.FlushDocumentQuery(recoveryFlush(7));

                expect(flushReplies(context.posted)).toEqual([
                    expect.objectContaining({ token: 7, status: "clean" }),
                ]);
            });
        });

        it("keeps the page inert from a destructive flush until the host releases it", async () => {
            const context = setup();
            await openSession(context);

            await context.session.handlers.FlushDocumentQuery(new FlushDocumentQuery(3, true));
            expect(document.body.inert).toBe(true);

            await context.session.handlers.ReleaseDocumentFlushQuery(
                new ReleaseDocumentFlushQuery(3),
            );
            expect(document.body.inert).toBe(false);
        });

        it("restores interaction after a declined destructive flush", () => {
            const context = setup();

            context.session.document.beginDestructiveFlush();
            expect(document.body.inert).toBe(true);
            context.session.document.endDestructiveFlush();

            expect(document.body.inert).toBe(false);
        });
    });

    describe("deferred actions", () => {
        it("defers focus and diagram refresh until the modeler is initialized", async () => {
            const context = setup();
            void context.session.receiveHostFile(hostFile("<initial />", 1));
            await context.session.openInitialDocument(
                await context.session.waitForInitialHostFile(),
            );

            await context.session.focusElement("Task_1");
            await context.session.applyLanguage("de");
            expect(context.surface.centerOnElement).not.toHaveBeenCalled();
            expect(context.surface.refreshDiagram).not.toHaveBeenCalled();

            context.session.markInitialized();
            await context.session.drainPendingActions();

            expect(context.surface.refreshDiagram).toHaveBeenCalledOnce();
            expect(context.surface.centerOnElement).toHaveBeenCalledWith("Task_1");
        });

        it("centres the element right away once the session is initialized", async () => {
            const context = setup();
            await openSession(context);

            await context.session.focusElement("Task_1");

            expect(context.surface.centerOnElement).toHaveBeenCalledExactlyOnceWith("Task_1");
        });

        it("centres only the last element asked for before the session was initialized", async () => {
            const context = setup();
            await importInitialFile(context);

            await context.session.focusElement("Task_1");
            await context.session.focusElement("Task_2");
            expect(context.surface.centerOnElement).not.toHaveBeenCalled();

            context.session.markInitialized();
            await context.session.drainPendingActions();

            expect(context.surface.centerOnElement).toHaveBeenCalledExactlyOnceWith("Task_2");
        });

        it("centres the element only after the queued host update imported", async () => {
            const context = setup();
            await openSession(context);

            void context.session.receiveHostFile(hostFile("<pushed />", 2));
            await context.session.focusElement("Task_1");

            expect(context.surface.importDocument).toHaveBeenLastCalledWith("<pushed />");
            expect(context.surface.importDocument.mock.invocationCallOrder.at(-1)).toBeLessThan(
                callOrder(context.surface.centerOnElement),
            );
        });

        it("imports the queued host update, then refreshes, then centres the element", async () => {
            const context = setup();
            await importInitialFile(context);
            await context.session.applyLanguage("de");
            await context.session.focusElement("Task_1");
            void context.session.receiveHostFile(hostFile("<pushed />", 2));

            context.session.markInitialized();
            await context.session.drainPendingActions();

            expect(context.surface.importDocument).toHaveBeenLastCalledWith("<pushed />");
            expect(context.surface.importDocument.mock.invocationCallOrder.at(-1)).toBeLessThan(
                callOrder(context.surface.refreshDiagram),
            );
            expect(callOrder(context.surface.refreshDiagram)).toBeLessThan(
                callOrder(context.surface.centerOnElement),
            );
        });

        it("reports a refresh that fails and still centres the element", async () => {
            const context = setup();
            await importInitialFile(context);
            context.surface.refreshDiagram.mockRejectedValueOnce(new Error("broken refresh"));
            await context.session.applyLanguage("de");
            await context.session.focusElement("Task_1");

            context.session.markInitialized();
            await context.session.drainPendingActions();

            expect(loggedErrors(context.posted)).toEqual([
                "Unable to refresh diagram\nbroken refresh",
            ]);
            expect(context.surface.centerOnElement).toHaveBeenCalledExactlyOnceWith("Task_1");
        });

        it("shares one drain between callers that overlap", async () => {
            const refresh = deferred();
            const context = setup();
            await importInitialFile(context);
            context.surface.refreshDiagram.mockImplementationOnce(() => refresh.promise);
            await context.session.applyLanguage("de");
            context.session.markInitialized();

            const first = context.session.drainPendingActions();
            const second = context.session.drainPendingActions();
            refresh.resolve();
            await Promise.all([first, second]);

            expect(second).toBe(first);
            expect(context.surface.refreshDiagram).toHaveBeenCalledOnce();
        });

        it("starts a fresh drain once the previous one has finished", async () => {
            const context = setup();
            await openSession(context);

            await context.session.drainPendingActions();
            await context.session.focusElement("Task_1");

            expect(context.surface.centerOnElement).toHaveBeenCalledOnce();
        });
    });

    describe("language changes", () => {
        it("switches the translator and refreshes the diagram once the locale changes", async () => {
            const context = setup();
            await openSession(context);

            await context.session.applyLanguage("de");

            expect(context.translator.getLocale()).toBe("de");
            expect(context.surface.refreshDiagram).toHaveBeenCalledOnce();
        });

        it.each([
            ["the same locale", "en"],
            ["an unknown locale that resolves to the current one", "xx"],
        ])("does not refresh for %s", async (_case, locale) => {
            const context = setup();
            await openSession(context);

            await context.session.applyLanguage(locale);

            expect(context.translator.setLanguage).toHaveBeenCalledExactlyOnceWith(locale);
            expect(context.surface.refreshDiagram).not.toHaveBeenCalled();
        });

        it("holds the refresh for a changed locale until the session is initialized", async () => {
            const context = setup();
            await importInitialFile(context);

            await context.session.applyLanguage("de");
            expect(context.translator.getLocale()).toBe("de");
            expect(context.surface.refreshDiagram).not.toHaveBeenCalled();

            context.session.markInitialized();
            await context.session.drainPendingActions();

            expect(context.surface.refreshDiagram).toHaveBeenCalledOnce();
        });
    });

    describe("host message handlers", () => {
        it("hands a host file to the boot", async () => {
            const context = setup();
            const file = hostFile("<initial />", 1);

            await context.session.handlers.BpmnFileQuery(file);

            await expect(context.session.waitForInitialHostFile()).resolves.toBe(file);
        });

        it("applies the host language", async () => {
            const context = setup();
            await openSession(context);

            await context.session.handlers.LanguageQuery(new LanguageQuery("de"));

            expect(context.translator.getLocale()).toBe("de");
            expect(context.surface.refreshDiagram).toHaveBeenCalledOnce();
        });

        it("centres the element the host focuses", async () => {
            const context = setup();
            await openSession(context);

            await context.session.handlers.FocusElementQuery(new FocusElementQuery("Task_1"));

            expect(context.surface.centerOnElement).toHaveBeenCalledExactlyOnceWith("Task_1");
        });
    });

    describe("engine reload", () => {
        it("stops syncs and imports and locks the page before the queued teardown runs", async () => {
            const context = setup();
            await openSession(context);
            const modeSwitch = deferred();
            void context.session.runExclusive(() => modeSwitch.promise);
            void context.session.receiveHostFile(hostFile("<pending />", 2));
            context.session.scheduleSync();

            const reloading = context.session.reloadForEngineChange();

            expect(context.session.isReloadingForEngine).toBe(true);
            expect(context.session.isReady()).toBe(false);
            expect(context.session.document.hasPendingSync()).toBe(false);
            expect(context.session.document.hasPendingHostUpdate()).toBe(false);
            expect(context.page.cancelPendingSurfaceWork).toHaveBeenCalledOnce();
            expect(document.body.inert).toBe(true);
            await vi.advanceTimersByTimeAsync(500);
            expect(context.page.destroySurface).not.toHaveBeenCalled();

            modeSwitch.resolve();
            await reloading;

            expect(callOrder(context.page.flushViewport)).toBeLessThan(
                callOrder(context.page.destroySurface),
            );
            expect(callOrder(context.page.destroySurface)).toBeLessThan(
                callOrder(context.page.reloadPage),
            );
            expect(context.surface.importDocument).toHaveBeenCalledOnce();
            expect(context.surface.exportDocument).not.toHaveBeenCalled();
            expect(document.body.inert).toBe(true);
        });

        it("ignores host pushes once the reload began", async () => {
            const context = setup();
            await openSession(context);

            await context.session.reloadForEngineChange();
            await pushHostFile(context.session, hostFile("<after the reload began />", 2));
            await pushHostFile(context.session, hostFile("<c8 />", 3, "c8"));

            expect(context.surface.importDocument).toHaveBeenCalledOnce();
            expect(context.page.reloadPage).toHaveBeenCalledOnce();
        });

        it("tears the page down only once", async () => {
            const context = setup();
            await openSession(context);

            await Promise.all([
                context.session.reloadForEngineChange(),
                context.session.reloadForEngineChange(),
            ]);

            expect(context.page.destroySurface).toHaveBeenCalledOnce();
            expect(context.page.reloadPage).toHaveBeenCalledOnce();
        });

        it("lets an in-flight sync reach the host before it tears the page down", async () => {
            const finishExport = deferred<string>();
            const context = setup();
            await openSession(context);
            context.surface.exportDocument.mockImplementationOnce(() => finishExport.promise);
            const syncsPostedBeforeDestroy: number[] = [];
            context.page.destroySurface.mockImplementation(() => {
                syncsPostedBeforeDestroy.push(syncCommands(context.posted).length);
            });

            context.session.scheduleSync();
            await vi.advanceTimersByTimeAsync(300);
            const reloading = context.session.reloadForEngineChange();
            await vi.advanceTimersByTimeAsync(0);
            expect(context.page.destroySurface).not.toHaveBeenCalled();

            finishExport.resolve("<last edit />");
            await reloading;

            expect(syncsPostedBeforeDestroy).toEqual([1]);
            expect(syncCommands(context.posted)).toEqual([
                expect.objectContaining({ content: "<last edit />" }),
            ]);
        });

        it("destroys the surface and reloads even when the last sync fails", async () => {
            const finishExport = deferred<string>();
            const context = setup();
            await openSession(context);
            context.surface.exportDocument.mockImplementationOnce(() => finishExport.promise);

            context.session.scheduleSync();
            await vi.advanceTimersByTimeAsync(300);
            const reloading = context.session.reloadForEngineChange();
            finishExport.reject(new Error("export broke"));
            await reloading;

            expect(loggedErrors(context.posted)).toEqual([
                "Failed to sync diagram changes: export broke",
            ]);
            expect(context.page.destroySurface).toHaveBeenCalledOnce();
            expect(context.page.reloadPage).toHaveBeenCalledOnce();
        });

        it("destroys the surface and reloads even when the viewport cannot be saved", async () => {
            const context = setup();
            await openSession(context);
            context.page.flushViewport.mockImplementationOnce(() => {
                throw new Error("no viewport");
            });

            await expect(context.session.reloadForEngineChange()).rejects.toThrow("no viewport");

            expect(context.page.destroySurface).toHaveBeenCalledOnce();
            expect(context.page.reloadPage).toHaveBeenCalledOnce();
        });

        it("reloads even when the surface cannot be destroyed", async () => {
            const context = setup();
            await openSession(context);
            context.page.destroySurface.mockImplementationOnce(() => {
                throw new Error("already gone");
            });

            await expect(context.session.reloadForEngineChange()).rejects.toThrow("already gone");

            expect(context.page.reloadPage).toHaveBeenCalledOnce();
        });

        it("drops the refresh and focus the host asked for", async () => {
            const context = setup();
            await importInitialFile(context);
            await context.session.applyLanguage("de");
            await context.session.focusElement("Task_1");

            await context.session.reloadForEngineChange();
            context.session.markInitialized();
            await context.session.drainPendingActions();
            await context.session.focusElement("Task_2");

            expect(context.surface.refreshDiagram).not.toHaveBeenCalled();
            expect(context.surface.centerOnElement).not.toHaveBeenCalled();
        });

        it("stops a drain when the reload lands while a host update imports", async () => {
            const pushImport = deferred();
            const context = setup();
            await importInitialFile(context);
            await context.session.applyLanguage("de");
            await context.session.focusElement("Task_1");
            context.surface.importDocument.mockImplementationOnce(() => pushImport.promise);
            void context.session.receiveHostFile(hostFile("<pushed />", 2));
            context.session.markInitialized();

            const draining = context.session.drainPendingActions();
            await vi.advanceTimersByTimeAsync(0);
            expect(context.surface.importDocument).toHaveBeenLastCalledWith("<pushed />");
            const reloading = context.session.receiveHostFile(hostFile("<c8 />", 3, "c8"));
            pushImport.resolve();
            await Promise.all([draining, reloading]);

            expect(context.surface.refreshDiagram).not.toHaveBeenCalled();
            expect(context.surface.centerOnElement).not.toHaveBeenCalled();
            expect(context.page.reloadPage).toHaveBeenCalledOnce();
        });

        it("drops a refresh and focus asked for after the reload landed mid-drain", async () => {
            const pushImport = deferred();
            const context = setup();
            await importInitialFile(context);
            context.surface.importDocument.mockImplementationOnce(() => pushImport.promise);
            void context.session.receiveHostFile(hostFile("<pushed />", 2));
            context.session.markInitialized();

            const draining = context.session.drainPendingActions();
            await vi.advanceTimersByTimeAsync(0);
            const reloading = context.session.receiveHostFile(hostFile("<c8 />", 3, "c8"));
            await context.session.applyLanguage("de");
            await context.session.focusElement("Task_1");
            pushImport.resolve();
            await Promise.all([draining, reloading]);

            expect(context.surface.refreshDiagram).not.toHaveBeenCalled();
            expect(context.surface.centerOnElement).not.toHaveBeenCalled();
            expect(context.page.reloadPage).toHaveBeenCalledOnce();
        });

        it("stops a drain when the reload lands during the refresh", async () => {
            const context = setup();
            await importInitialFile(context);
            await context.session.applyLanguage("de");
            await context.session.focusElement("Task_1");
            let reloading: Promise<void> | undefined;
            context.surface.refreshDiagram.mockImplementationOnce(async () => {
                reloading = context.session.receiveHostFile(hostFile("<c8 />", 2, "c8"));
            });
            context.session.markInitialized();

            await context.session.drainPendingActions();
            await reloading;

            expect(context.surface.refreshDiagram).toHaveBeenCalledOnce();
            expect(context.surface.centerOnElement).not.toHaveBeenCalled();
            expect(context.page.reloadPage).toHaveBeenCalledOnce();
        });
    });
});
