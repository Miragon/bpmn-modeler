import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    DmnFileQuery,
    DmnModelerSettingQuery,
    FlushDocumentQuery,
    LanguageQuery,
    PropertiesPanelStateQuery,
    ReleaseDocumentFlushQuery,
} from "@miragon/bpmn-modeler-shared";
import type { DmnModelerOptions } from "@miragon/dmn-modeler";

import { bootstrap } from "./bootstrap";
import { getHostApi } from "./host";
import type { WebviewState } from "./webviewState";

const mocks = vi.hoisted(() => {
    const handle = {
        loadDiagram: vi.fn(async (_xml: string) => ({ warnings: [] })),
        exportDiagram: vi.fn(async () => "<saved />"),
        getActiveView: vi.fn(),
        getViews: vi.fn(() => []),
        openView: vi.fn(async () => ({ warnings: [] })),
        isDrdViewActive: vi.fn(() => true),
        focusCanvas: vi.fn(),
        isCanvasFocused: vi.fn(() => true),
        setTheme: vi.fn(),
        setLocale: vi.fn(async (_locale: string) => undefined),
        destroy: vi.fn(),
        getService: vi.fn(),
    };
    const panelHandle = {
        isVisible: vi.fn(() => true),
        setVisible: vi.fn(),
        onVisibilityChanged: vi.fn(),
        dispose: vi.fn(),
    };
    return {
        handle,
        panelHandle,
        createModeler: vi.fn(
            async (_container: HTMLElement, _options: DmnModelerOptions) => handle,
        ),
        initResizer: vi.fn(() => panelHandle),
        installPanelShortcuts: vi.fn(),
        installCanvasAutoFocus: vi.fn((_options: { focusCanvas(): void }) => () => undefined),
        setLanguage: vi.fn(),
        getLocale: vi.fn(() => "en"),
    };
});

vi.mock("@miragon/dmn-modeler", () => ({ createModeler: mocks.createModeler }));

vi.mock("@miragon/bpmn-modeler-i18n", () => ({
    i18n: {
        translate: (text: string) => text,
        onChange: vi.fn(),
        setLanguage: mocks.setLanguage,
        getLocale: mocks.getLocale,
    },
}));

vi.mock("@miragon/bpmn-modeler-shared", async () => {
    const actual = await vi.importActual<Record<string, unknown>>("@miragon/bpmn-modeler-shared");
    return {
        ...actual,
        initResizer: mocks.initResizer,
        installPanelShortcuts: mocks.installPanelShortcuts,
        installCanvasAutoFocus: mocks.installCanvasAutoFocus,
    };
});

interface PostedMessage {
    type: string;
    content?: string;
    documentRevision?: number;
    message?: string;
    stack?: string;
    token?: number;
    status?: string;
    visible?: boolean;
}

type Replies = Record<string, () => unknown>;

const defaultReplies: Replies = {
    GetDmnFileCommand: () => new DmnFileQuery("<initial />", 7),
    GetPropertiesPanelStateCommand: () => new PropertiesPanelStateQuery(true),
    GetDmnModelerSettingCommand: () => new DmnModelerSettingQuery({ colorTheme: "automatic" }),
};

const startedSessions: Array<() => void> = [];

function startSession(...args: Parameters<typeof bootstrap>): () => void {
    const stop = bootstrap(...args);
    startedSessions.push(stop);
    return stop;
}

function dispatch(data: unknown): void {
    window.dispatchEvent(new MessageEvent("message", { data }));
}

function renderShell(panelContent = ""): void {
    document.body.innerHTML = `
        <main id="js-canvas"></main>
        <aside id="js-properties-panel">${panelContent}</aside>
    `;
}

async function startBootstrap({
    savedState,
    replies = defaultReplies,
}: { savedState?: WebviewState; replies?: Replies } = {}) {
    const posted: PostedMessage[] = [];
    const host = {
        postMessage: vi.fn((message: PostedMessage) => {
            posted.push(message);
            const reply = replies[message.type];
            if (reply) {
                queueMicrotask(() => dispatch(reply()));
            }
        }),
        getState: vi.fn(() => savedState),
        setState: vi.fn(),
        updateState: vi.fn(),
    };
    const stop = startSession(host as never);
    return {
        host,
        posted,
        stop,
        ofType: (type: string) => posted.filter((message) => message.type === type),
        options: () => mocks.createModeler.mock.calls[0][1],
    };
}

async function startReady(options: Parameters<typeof startBootstrap>[0] = {}) {
    const session = await startBootstrap(options);
    await vi.waitFor(() => expect(session.ofType("RequestFocusCommand")).toHaveLength(1));
    return session;
}

describe("DMN bootstrap", () => {
    let windowAddEventListener: ReturnType<typeof vi.spyOn>;
    let documentAddEventListener: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        windowAddEventListener = vi.spyOn(window, "addEventListener");
        documentAddEventListener = vi.spyOn(document, "addEventListener");
        document.body.className = "";
        renderShell();
        Object.defineProperty(document, "readyState", { value: "complete", configurable: true });
    });

    afterEach(() => {
        for (const stop of startedSessions.splice(0)) {
            stop();
        }
        for (const [type, listener, options] of windowAddEventListener.mock.calls) {
            window.removeEventListener(type, listener as EventListener, options);
        }
        for (const [type, listener, options] of documentAddEventListener.mock.calls) {
            document.removeEventListener(type, listener as EventListener, options);
        }
        vi.useRealTimers();
        vi.resetAllMocks();
        vi.restoreAllMocks();
        Object.defineProperty(document, "visibilityState", {
            value: "visible",
            configurable: true,
        });
        document.body.inert = false;
        document.body.innerHTML = "";
    });

    it("adapts facade callbacks, authoritative updates, flushes, warnings, and shortcuts", async () => {
        const { host, posted, options } = await startBootstrap();

        await vi.waitFor(() =>
            expect(mocks.handle.loadDiagram).toHaveBeenCalledWith("<initial />"),
        );

        const canvas = document.querySelector("#js-canvas");
        const panel = document.querySelector("#js-properties-panel");
        expect(mocks.createModeler).toHaveBeenCalledWith(
            canvas,
            expect.objectContaining({ propertiesPanel: { parent: panel }, theme: "light" }),
        );
        // The host adapter scoped the page on `<html>` off the (light) VS Code signal.
        expect(document.documentElement.getAttribute("data-dmn-theme")).toBe("light");
        expect(mocks.createModeler.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.initResizer.mock.invocationCallOrder[0],
        );

        options().onWarning?.("recovered warning");
        expect(posted).toContainEqual(
            expect.objectContaining({ type: "LogWarningCommand", message: "recovered warning" }),
        );

        await vi.waitFor(() => expect(mocks.installPanelShortcuts).toHaveBeenCalledOnce());
        const shortcutOptions = mocks.installPanelShortcuts.mock.calls[0][0];
        shortcutOptions.focusCanvas();
        expect(shortcutOptions.isCanvasFocused()).toBe(true);
        expect(shortcutOptions.isEnabled()).toBe(true);
        expect(mocks.handle.focusCanvas).toHaveBeenCalledOnce();
        expect(mocks.handle.isCanvasFocused).toHaveBeenCalledOnce();
        expect(mocks.handle.isDrdViewActive).toHaveBeenCalledOnce();

        expect(mocks.installCanvasAutoFocus).toHaveBeenCalledOnce();
        mocks.installCanvasAutoFocus.mock.calls[0][0].focusCanvas();
        expect(mocks.handle.focusCanvas).toHaveBeenCalledTimes(2);

        await vi.waitFor(() =>
            expect(posted).toContainEqual(expect.objectContaining({ type: "RequestFocusCommand" })),
        );
        dispatch({ type: "TakeFocusQuery" });
        await vi.waitFor(() => expect(mocks.handle.focusCanvas).toHaveBeenCalledTimes(3));

        options().onContentChanged?.();
        dispatch({ type: "DmnFileQuery", content: "<host-update />", documentRevision: 8 });
        await vi.waitFor(
            () => expect(mocks.handle.loadDiagram).toHaveBeenCalledWith("<host-update />"),
            { timeout: 1000 },
        );
        await new Promise((resolve) => setTimeout(resolve, 350));
        expect(posted.filter((message) => message.type === "SyncDocumentCommand")).toHaveLength(0);

        mocks.handle.exportDiagram.mockResolvedValueOnce("<edited-after-host />");
        options().onContentChanged?.();
        await vi.waitFor(
            () =>
                expect(posted).toContainEqual(
                    expect.objectContaining({
                        type: "SyncDocumentCommand",
                        content: "<edited-after-host />",
                        documentRevision: 8,
                    }),
                ),
            { timeout: 1000 },
        );

        mocks.handle.exportDiagram.mockResolvedValueOnce("<flush />");
        options().onContentChanged?.();
        dispatch({ type: "FlushDocumentQuery", token: 41, exportWhenClean: true });
        await vi.waitFor(
            () =>
                expect(posted).toContainEqual(
                    expect.objectContaining({
                        type: "DocumentFlushedCommand",
                        token: 41,
                        content: "<flush />",
                    }),
                ),
            { timeout: 1000 },
        );

        // A forced colorTheme setting drives the instance's live setTheme.
        mocks.handle.setTheme.mockClear();
        dispatch({ type: "DmnModelerSettingQuery", setting: { colorTheme: "light" } });
        await vi.waitFor(() => expect(mocks.handle.setTheme).toHaveBeenCalledWith("light"));

        // Back in automatic, a VS Code dark body class re-themes the open editor.
        dispatch({ type: "DmnModelerSettingQuery", setting: { colorTheme: "automatic" } });
        document.body.classList.add("vscode-dark");
        await vi.waitFor(() => expect(mocks.handle.setTheme).toHaveBeenCalledWith("dark"));
        document.body.classList.remove("vscode-dark");

        // A LanguageQuery routes to the handle, which owns the resolved-locale
        // guard and the active-view re-open.
        dispatch({ type: "LanguageQuery", locale: "de" });
        await vi.waitFor(() => expect(mocks.handle.setLocale).toHaveBeenCalledWith("de"));
        expect(host.postMessage).not.toHaveBeenCalledWith(
            expect.objectContaining({ type: "LogErrorCommand" }),
        );
    });

    it("seeds a forced theme and locale from bootstrap opts", async () => {
        const host = {
            postMessage: vi.fn(),
            getState: () => undefined,
            setState: vi.fn(),
            updateState: vi.fn(),
        };

        startSession(host as never, { theme: "dark", locale: "de" });

        // The forced dark mode reaches the instance before any settings reply,
        // and the locale is seeded before the modeler renders.
        await vi.waitFor(() => expect(mocks.handle.setTheme).toHaveBeenCalledWith("dark"));
        expect(mocks.setLanguage).toHaveBeenCalledWith("de");
    });

    it("forwards injected additionalModules to createModeler", async () => {
        const host = {
            postMessage: vi.fn(),
            getState: () => undefined,
            setState: vi.fn(),
            updateState: vi.fn(),
        };

        const drdRecorder = { id: "recorder" };
        startSession(host as never, { additionalModules: { drd: [drdRecorder] } });

        await vi.waitFor(() =>
            expect(mocks.createModeler).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ additionalModules: { drd: [drdRecorder] } }),
            ),
        );
    });

    it("waits for the page load before creating the modeler", async () => {
        Object.defineProperty(document, "readyState", { value: "loading", configurable: true });
        await startBootstrap();
        await Promise.resolve();

        expect(mocks.createModeler).not.toHaveBeenCalled();

        window.dispatchEvent(new Event("load"));

        await vi.waitFor(() => expect(mocks.createModeler).toHaveBeenCalledOnce());
    });

    it("forwards uncaught errors to the host log", async () => {
        const { ofType } = await startBootstrap();

        window.dispatchEvent(
            new ErrorEvent("error", { message: "boom", error: new Error("boom") }),
        );

        expect(ofType("LogErrorCommand")).toContainEqual(
            expect.objectContaining({ message: "Unhandled error: boom" }),
        );
    });

    it("keeps two bootstraps in one module instance on their own documents, revisions and hosts", async () => {
        const secondModeler = {
            ...mocks.handle,
            loadDiagram: vi.fn(async (_xml: string) => ({ warnings: [] })),
            exportDiagram: vi.fn(async () => "<second-edit />"),
        };
        const first = await startReady();
        mocks.createModeler.mockResolvedValueOnce(secondModeler);

        const second = await startReady({
            replies: {
                ...defaultReplies,
                GetDmnFileCommand: () => new DmnFileQuery("<second />", 1),
            },
        });

        expect(secondModeler.loadDiagram).toHaveBeenCalledWith("<second />");
        expect(second.ofType("GetDmnFileCommand")).toHaveLength(1);

        dispatch(new DmnFileQuery("<second-update />", 2));
        await vi.waitFor(() =>
            expect(secondModeler.loadDiagram).toHaveBeenCalledWith("<second-update />"),
        );
        expect(mocks.handle.loadDiagram).not.toHaveBeenCalledWith("<second-update />");

        mocks.createModeler.mock.calls[0][1].onContentChanged?.();
        mocks.createModeler.mock.calls[1][1].onContentChanged?.();

        await vi.waitFor(
            () => {
                expect(first.ofType("SyncDocumentCommand")).toEqual([
                    expect.objectContaining({ content: "<saved />", documentRevision: 7 }),
                ]);
                expect(second.ofType("SyncDocumentCommand")).toEqual([
                    expect.objectContaining({ content: "<second-edit />", documentRevision: 2 }),
                ]);
            },
            { timeout: 1000 },
        );
    });

    describe("stopping a session", () => {
        it("stops reacting to the host and the page", async () => {
            const pageTheme = () => document.documentElement.getAttribute("data-dmn-theme");
            const { posted, options, stop } = await startReady();
            document.body.classList.add("vscode-dark");
            await vi.waitFor(() => expect(pageTheme()).toBe("dark"));
            options().onContentChanged?.();
            const postedBeforeStop = posted.length;

            stop();
            dispatch(new DmnFileQuery("<after-stop />", 9));
            dispatch(new FlushDocumentQuery(12));
            dispatch(new DmnModelerSettingQuery({ colorTheme: "light" }));
            Object.defineProperty(document, "visibilityState", {
                value: "hidden",
                configurable: true,
            });
            document.dispatchEvent(new Event("visibilitychange"));
            window.dispatchEvent(new ErrorEvent("error", { message: "late" }));
            document.body.classList.remove("vscode-dark");
            await new Promise((resolve) => setTimeout(resolve, 400));

            expect(posted).toHaveLength(postedBeforeStop);
            expect(mocks.handle.loadDiagram).not.toHaveBeenCalledWith("<after-stop />");
            expect(mocks.handle.exportDiagram).not.toHaveBeenCalled();
            expect(pageTheme()).toBe("dark");
        });

        it("destroys the modeler and the resizer, unlocks a flush, and detaches the canvas shortcuts", async () => {
            const removeCanvasAutoFocus = vi.fn();
            mocks.installCanvasAutoFocus.mockReturnValue(removeCanvasAutoFocus);
            const { ofType, stop } = await startReady();
            dispatch(new FlushDocumentQuery(4, true, true));
            await vi.waitFor(() => expect(ofType("DocumentFlushedCommand")).toHaveLength(1));
            expect(document.body.inert).toBe(true);

            stop();

            expect(mocks.handle.destroy).toHaveBeenCalledOnce();
            expect(mocks.panelHandle.dispose).toHaveBeenCalledOnce();
            expect(document.body.inert).toBe(false);
            expect(removeCanvasAutoFocus).toHaveBeenCalledOnce();
            expect(mocks.installPanelShortcuts.mock.calls[0][0].isEnabled()).toBe(false);
        });

        it("drops an export that finishes after the stop", async () => {
            const { ofType, options, stop } = await startReady();
            let finishExport!: (xml: string) => void;
            mocks.handle.exportDiagram.mockImplementationOnce(
                () => new Promise<string>((resolve) => (finishExport = resolve)),
            );
            options().onContentChanged?.();
            await vi.waitFor(() => expect(mocks.handle.exportDiagram).toHaveBeenCalledOnce(), {
                timeout: 1000,
            });

            stop();
            finishExport("<late-edit />");
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(ofType("SyncDocumentCommand")).toHaveLength(0);
        });

        it("destroys a modeler that finishes creating after the stop", async () => {
            let finishCreating!: () => void;
            mocks.createModeler.mockImplementationOnce(
                () => new Promise((resolve) => (finishCreating = () => resolve(mocks.handle))),
            );
            const { ofType, stop } = await startBootstrap();
            await vi.waitFor(() => expect(mocks.createModeler).toHaveBeenCalledOnce());

            stop();
            finishCreating();

            await vi.waitFor(() => expect(mocks.handle.destroy).toHaveBeenCalledOnce());
            expect(ofType("GetDmnFileCommand")).toHaveLength(0);
        });

        it("skips the restore when stopped while waiting for the host settings", async () => {
            vi.useFakeTimers();
            const { GetDmnModelerSettingCommand: _, ...withoutSettings } = defaultReplies;
            const { ofType, stop } = await startBootstrap({ replies: withoutSettings });
            await vi.advanceTimersByTimeAsync(0);
            expect(mocks.handle.loadDiagram).toHaveBeenCalledWith("<initial />");

            stop();
            await vi.advanceTimersByTimeAsync(5000);

            expect(ofType("RequestFocusCommand")).toHaveLength(0);
            expect(mocks.installPanelShortcuts).not.toHaveBeenCalled();
        });

        it("never starts when stopped before the page loaded", async () => {
            Object.defineProperty(document, "readyState", { value: "loading", configurable: true });
            const { stop } = await startBootstrap();

            stop();
            window.dispatchEvent(new Event("load"));
            await Promise.resolve();

            expect(mocks.createModeler).not.toHaveBeenCalled();
        });
    });

    describe("document flush on close", () => {
        it("locks the editor, drains the pending edit, and unlocks on release", async () => {
            const { posted, options } = await startReady();
            mocks.handle.exportDiagram.mockResolvedValue("<edited />");

            options().onContentChanged?.();
            dispatch(new FlushDocumentQuery(5, true));

            await vi.waitFor(() =>
                expect(posted.map((message) => message.type)).toContain("DocumentFlushedCommand"),
            );
            const types = posted.map((message) => message.type);
            expect(types.indexOf("SyncDocumentCommand")).toBeLessThan(
                types.indexOf("DocumentFlushedCommand"),
            );
            expect(posted.at(-1)).toMatchObject({
                token: 5,
                status: "flushed",
                content: "<edited />",
                documentRevision: 7,
            });
            expect(document.body.inert).toBe(true);

            dispatch(new ReleaseDocumentFlushQuery(5));

            await vi.waitFor(() => expect(document.body.inert).toBe(false));
        });

        it("keeps an editor that was already inert locked after the release", async () => {
            await startReady();
            document.body.inert = true;

            dispatch(new FlushDocumentQuery(6, true, true));
            await vi.waitFor(() => expect(mocks.handle.exportDiagram).toHaveBeenCalled());
            dispatch(new ReleaseDocumentFlushQuery(6));
            await Promise.resolve();

            expect(document.body.inert).toBe(true);
        });

        it("flushes the pending edit when the webview is hidden", async () => {
            const { ofType, options } = await startReady();

            options().onContentChanged?.();
            Object.defineProperty(document, "visibilityState", {
                value: "hidden",
                configurable: true,
            });
            document.dispatchEvent(new Event("visibilitychange"));

            await vi.waitFor(() => expect(ofType("SyncDocumentCommand")).toHaveLength(1), {
                timeout: 100,
            });
        });
    });

    describe("host document updates", () => {
        it("reports an unreadable initial document and still finishes starting", async () => {
            mocks.handle.loadDiagram.mockRejectedValueOnce(new Error("not DMN"));

            const { ofType } = await startReady();

            expect(ofType("LogErrorCommand")).toContainEqual(
                expect.objectContaining({ message: "Unable to open XML not DMN" }),
            );
        });

        it("finishes starting when a host update fails while the first import runs", async () => {
            let releaseInitialImport!: () => void;
            const initialImport = new Promise<void>((resolve) => {
                releaseInitialImport = resolve;
            });
            mocks.handle.loadDiagram.mockImplementation(async (xml: string) => {
                if (xml === "<initial />") await initialImport;
                if (xml === "<broken />") throw new Error("broken host xml");
                return { warnings: [] };
            });
            const { ofType } = await startBootstrap();
            await vi.waitFor(() =>
                expect(mocks.handle.loadDiagram).toHaveBeenCalledWith("<initial />"),
            );

            dispatch(new DmnFileQuery("<broken />", 8));
            releaseInitialImport();

            await vi.waitFor(() => expect(ofType("RequestFocusCommand")).toHaveLength(1));
            expect(ofType("LogErrorCommand")).toContainEqual(
                expect.objectContaining({
                    message: "Something went wrong when receiving the message broken host xml",
                }),
            );
            dispatch(new FlushDocumentQuery(3));
            await vi.waitFor(() =>
                expect(ofType("DocumentFlushedCommand")).toContainEqual(
                    expect.objectContaining({ token: 3, status: "clean" }),
                ),
            );
        });

        it("ignores a host document older than the one already shown", async () => {
            await startReady();

            dispatch(new DmnFileQuery("<stale />", 5));
            await new Promise((resolve) => setTimeout(resolve, 150));

            expect(mocks.handle.loadDiagram).not.toHaveBeenCalledWith("<stale />");
        });

        it("drops an export that a host update overtook", async () => {
            const { ofType, options } = await startReady();
            let finishExport!: (xml: string) => void;
            mocks.handle.exportDiagram.mockImplementationOnce(
                () => new Promise<string>((resolve) => (finishExport = resolve)),
            );

            options().onContentChanged?.();
            await vi.waitFor(() => expect(mocks.handle.exportDiagram).toHaveBeenCalledOnce(), {
                timeout: 1000,
            });
            dispatch(new DmnFileQuery("<host-update />", 8));
            await vi.waitFor(() =>
                expect(mocks.handle.loadDiagram).toHaveBeenCalledWith("<host-update />"),
            );
            finishExport("<stale-edit />");
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(ofType("SyncDocumentCommand")).toHaveLength(0);
        });

        it("loads nothing for an empty document but still tracks its revision", async () => {
            const { ofType, options } = await startReady({
                replies: { ...defaultReplies, GetDmnFileCommand: () => new DmnFileQuery("", 3) },
            });

            dispatch(new DmnFileQuery("", 4));
            await new Promise((resolve) => setTimeout(resolve, 150));
            options().onContentChanged?.();

            await vi.waitFor(
                () =>
                    expect(ofType("SyncDocumentCommand")).toEqual([
                        expect.objectContaining({ content: "<saved />", documentRevision: 4 }),
                    ]),
                { timeout: 1000 },
            );
            expect(mocks.handle.loadDiagram).not.toHaveBeenCalled();
        });

        it("reports a failed outbound sync", async () => {
            const { ofType, options } = await startReady();
            mocks.handle.exportDiagram.mockRejectedValueOnce(new Error("export broke"));

            options().onContentChanged?.();

            await vi.waitFor(
                () =>
                    expect(ofType("LogErrorCommand")).toContainEqual(
                        expect.objectContaining({
                            message: "Failed to sync diagram changes: export broke",
                        }),
                    ),
                { timeout: 1000 },
            );
        });

        it("reports a language the modeler could not switch to", async () => {
            const { ofType } = await startReady();
            mocks.handle.setLocale.mockRejectedValueOnce(new Error("no such locale"));

            dispatch(new LanguageQuery("xx"));

            await vi.waitFor(() =>
                expect(ofType("LogErrorCommand")).toContainEqual(
                    expect.objectContaining({ message: "Failed to set language: no such locale" }),
                ),
            );
        });
    });

    describe("in the serve preview", () => {
        afterEach(() => {
            vi.unstubAllEnvs();
        });

        it("syncs an edit to the development host without logging an error", async () => {
            vi.stubEnv("NODE_ENV", "development");
            vi.spyOn(console, "debug").mockImplementation(() => undefined);
            const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
            const previewHost = getHostApi();
            const postMessage = vi.spyOn(previewHost, "postMessage");

            startSession(previewHost);
            await vi.waitFor(() =>
                expect(postMessage).toHaveBeenCalledWith(
                    expect.objectContaining({ type: "RequestFocusCommand" }),
                ),
            );
            mocks.createModeler.mock.calls[0][1].onContentChanged?.();

            await vi.waitFor(
                () =>
                    expect(postMessage).toHaveBeenCalledWith(
                        expect.objectContaining({
                            type: "SyncDocumentCommand",
                            content: "<saved />",
                        }),
                    ),
                { timeout: 1000 },
            );
            expect(consoleError).not.toHaveBeenCalled();
        });
    });

    describe("properties panel", () => {
        it("applies the editor's saved visibility instead of the host default", async () => {
            await startReady({ savedState: { panelVisible: false } });

            expect(mocks.panelHandle.setVisible).toHaveBeenCalledWith(false);
            expect(mocks.panelHandle.setVisible).not.toHaveBeenCalledWith(true);
        });

        it("falls back to a visible panel when the host never answers", async () => {
            vi.useFakeTimers();
            const { GetPropertiesPanelStateCommand: _, ...withoutPanelState } = defaultReplies;
            const { ofType } = await startBootstrap({ replies: withoutPanelState });
            await vi.advanceTimersByTimeAsync(0);
            expect(mocks.panelHandle.setVisible).not.toHaveBeenCalled();

            await vi.advanceTimersByTimeAsync(5000);

            expect(mocks.panelHandle.setVisible).toHaveBeenCalledWith(true);
            expect(ofType("RequestFocusCommand")).toHaveLength(1);
        });

        it("persists a toggle per editor and as the new host default", async () => {
            const { host, ofType } = await startReady();
            const onVisibilityChanged = mocks.panelHandle.onVisibilityChanged.mock.calls[0][0];

            onVisibilityChanged(false);

            expect(host.updateState).toHaveBeenCalledWith({ panelVisible: false });
            expect(ofType("SetPropertiesPanelStateCommand")).toEqual([
                expect.objectContaining({ visible: false }),
            ]);
        });

        it("restores the saved group expansion inside its own panel", async () => {
            renderShell(`
                <div class="bio-properties-panel-scroll-container">
                    <div class="bio-properties-panel-group">
                        <div class="bio-properties-panel-group-header"></div>
                    </div>
                </div>
            `);
            const header = document.querySelector<HTMLElement>(
                ".bio-properties-panel-group-header",
            )!;
            header.addEventListener("click", () => header.classList.toggle("open"));

            await startReady({ savedState: { expandedGroupIndexes: [0] } });

            await vi.waitFor(() => expect(header.classList.contains("open")).toBe(true));
        });

        it("collapses a default-open group when every group was saved collapsed", async () => {
            renderShell(`
                <div class="bio-properties-panel-scroll-container">
                    <div class="bio-properties-panel-group">
                        <div class="bio-properties-panel-group-header open"></div>
                    </div>
                </div>
            `);
            const header = document.querySelector<HTMLElement>(
                ".bio-properties-panel-group-header",
            )!;
            header.addEventListener("click", () => header.classList.toggle("open"));

            await startReady({ savedState: { expandedGroupIndexes: [] } });

            await vi.waitFor(() => expect(header.classList.contains("open")).toBe(false));
        });
    });
});
