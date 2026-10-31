import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ImplementationStatusQuery } from "@miragon/bpmn-modeler-shared";
import { ImplementationEntry, implementationStatusKey } from "@miragon/bpmn-modeler-types";

import { createTestHost, FakeEditorHandle } from "../../testing";
import { CODE_LINK_SCHEMA_VERSION } from "../domain/codeLinkArtifact";
import { CodeLinkMapService } from "./CodeLinkMapService";

const ROOT = "/work/proj";
const DOC = "/work/proj/order.bpmn";
const SECOND_DOC = "/work/proj/invoice.bpmn";
const ARTIFACT = "/work/proj/.camunda/code-link/order.bpmn.json";

/**
 * `resolveMap` keys a reference to the paths a batched resolve returns;
 * `fileContents` seeds the workspace behind verification reads and the
 * warm-cache load.
 */
function createService(
    opts: {
        persist?: boolean;
        resolveMap?: Record<string, string[]>;
        fileContents?: Record<string, string>;
        root?: string;
    } = {},
) {
    const resolveMap = opts.resolveMap ?? {};
    const root = opts.root ?? ROOT;
    const host = createTestHost({
        folders: [root],
        files: opts.fileContents,
        settings: { persistCodeLinkMap: opts.persist ?? false },
    });
    const editor = host.openEditor(opts.root ? `${root}/order.bpmn` : DOC);
    const secondEditor = host.openEditor(opts.root ? `${root}/invoice.bpmn` : SECOND_DOC);
    const watchers = host.workspace.watchers;

    const locator = {
        resolveMany: vi.fn((entries: ImplementationEntry[]) =>
            Promise.resolve(
                new Map(
                    entries.map((entry) => [entry.activityId, resolveMap[entry.reference] ?? []]),
                ),
            ),
        ),
    };

    const sourceCatalog = { listSources: vi.fn(), inspect: vi.fn() };
    const sourceIndex = {
        sourcesFor: vi.fn(() => sourceCatalog),
        release: vi.fn(),
        dispose: vi.fn(),
    };

    const artifactSvc = { getWorkspaceRoot: vi.fn(() => Promise.resolve(root)) };

    const service = new CodeLinkMapService(
        host.store,
        locator as never,
        sourceIndex as never,
        artifactSvc as never,
        host.workspace,
        host.settings,
        host.notifier,
        10,
    );

    return {
        service,
        host,
        editor,
        secondEditor,
        watchers,
        locator,
        sourceIndex,
        sourceCatalog,
        artifactSvc,
    };
}

function lastStatus(editor: FakeEditorHandle): Record<string, boolean> | undefined {
    const statuses = editor.postedOfType<ImplementationStatusQuery>("ImplementationStatusQuery");
    return statuses[statuses.length - 1]?.resolved;
}

const entry = (
    activityId: string,
    kind: ImplementationEntry["kind"],
    reference: string,
): ImplementationEntry => ({ activityId, kind, reference });

/** An artifact an earlier session wrote, with workspace-relative paths. */
function warmArtifact(warmEntry: ImplementationEntry, paths: string[]): string {
    return JSON.stringify({
        schemaVersion: CODE_LINK_SCHEMA_VERSION,
        bpmnFile: "order.bpmn",
        generatedAt: "t",
        entries: [{ ...warmEntry, resolved: paths.length > 0, paths }],
    });
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("CodeLinkMapService — sync diff", () => {
    it("cold-open batch-resolves all activities and pushes their status", async () => {
        const abs = "/work/proj/src/A.java";
        const { service, editor, locator, sourceIndex, sourceCatalog } = createService({
            resolveMap: { "com.example.A": [abs] },
        });

        await service.syncActivities(editor.id, [entry("Act_A", "javaClass", "com.example.A")]);

        expect(locator.resolveMany).toHaveBeenCalledTimes(1);
        expect(sourceIndex.sourcesFor).toHaveBeenCalledWith(editor.id, DOC);
        expect(locator.resolveMany.mock.calls[0]).toEqual([
            [entry("Act_A", "javaClass", "com.example.A")],
            DOC,
            sourceCatalog,
        ]);
        expect(lastStatus(editor)).toEqual({
            [implementationStatusKey("Act_A", "com.example.A")]: true,
        });
    });

    it("verifies an unchanged resolved entry with a read instead of re-resolving", async () => {
        const abs = "/work/proj/src/main/java/com/example/A.java";
        const { service, host, editor, locator } = createService({
            resolveMap: { "com.example.A": [abs] },
            fileContents: { [abs]: "class A {}" },
        });
        const entries = [entry("Act", "javaClass", "com.example.A")];

        await service.syncActivities(editor.id, entries);
        const readFile = vi.spyOn(host.workspace, "readFile");
        await service.syncActivities(editor.id, entries);

        expect(locator.resolveMany).toHaveBeenCalledTimes(1); // not re-resolved
        expect(readFile.mock.calls).toEqual([[abs]]); // verified by a single read
    });

    describe("a bean declared in a class named differently", () => {
        const beanClass = "/work/proj/src/PaymentService.java";
        const entries = [entry("Act", "delegateExpression", "${paymentBean}")];
        const status = implementationStatusKey("Act", "${paymentBean}");

        function createLinkedService() {
            const resolveMap: Record<string, string[]> = { "${paymentBean}": [beanClass] };
            const created = createService({
                resolveMap,
                fileContents: { [beanClass]: '@Service("paymentBean")\nclass PaymentService {}' },
            });
            return { ...created, resolveMap };
        }

        it("stays linked while the file still declares the bean", async () => {
            const { service, editor, locator } = createLinkedService();

            await service.syncActivities(editor.id, entries);
            await service.syncActivities(editor.id, entries);

            expect(locator.resolveMany).toHaveBeenCalledTimes(1);
            expect(lastStatus(editor)).toEqual({ [status]: true });
        });

        it("is unlinked and resolved again once the file no longer declares it", async () => {
            const { service, host, editor, locator, resolveMap } = createLinkedService();
            await service.syncActivities(editor.id, entries);

            // Edited without a watcher event, so only the verification read sees it.
            host.workspace.files.set(beanClass, "class PaymentService {}");
            delete resolveMap["${paymentBean}"];
            await service.syncActivities(editor.id, entries);

            expect(locator.resolveMany.mock.calls.map(([resolved]) => resolved)).toEqual([
                entries,
                entries,
            ]);
            expect(lastStatus(editor)).toEqual({ [status]: false });
        });
    });

    it("re-resolves an activity whose linked file no longer implements it", async () => {
        const worker = "/work/proj/src/Worker.java";
        const { service, host, editor, locator } = createService({
            resolveMap: { pay: [worker] },
            fileContents: { [worker]: '@JobWorker(type = "pay")' },
        });
        const entries = [entry("Act", "jobType", "pay")];
        await service.syncActivities(editor.id, entries);

        // Edited without a watcher event, so only the verification read sees it.
        host.workspace.files.set(worker, "class Worker {}");
        await service.syncActivities(editor.id, entries);

        expect(locator.resolveMany.mock.calls.map(([resolved]) => resolved)).toEqual([
            entries,
            entries,
        ]);
    });
});

describe("CodeLinkMapService — warm cache", () => {
    it("loads the artifact and verifies, skipping the batched resolve (persist on)", async () => {
        const abs = "/work/proj/src/main/java/com/example/A.java";
        const warm = warmArtifact(entry("Act", "javaClass", "com.example.A"), [
            "src/main/java/com/example/A.java",
        ]);
        const { service, editor, locator } = createService({
            persist: true,
            fileContents: { [ARTIFACT]: warm, [abs]: "class A {}" },
        });

        await service.syncActivities(editor.id, [entry("Act", "javaClass", "com.example.A")]);

        expect(locator.resolveMany).not.toHaveBeenCalled();
        expect(lastStatus(editor)).toEqual({
            [implementationStatusKey("Act", "com.example.A")]: true,
        });
    });

    it("loads the warm cache when persistence is toggled on mid-session", async () => {
        const abs = "/work/proj/src/main/java/com/example/A.java";
        const warm = warmArtifact(entry("Act", "javaClass", "com.example.A"), [
            "src/main/java/com/example/A.java",
        ]);
        const { service, host, editor } = createService({
            persist: false,
            resolveMap: { "com.example.A": [abs] },
            fileContents: { [ARTIFACT]: warm, [abs]: "class A {}" },
        });
        const entries = [entry("Act", "javaClass", "com.example.A")];
        const artifactLogs = () =>
            host.notifier.logs.filter(({ message }) => message.includes(ARTIFACT));

        await service.syncActivities(editor.id, entries);
        // Persist off: the artifact must not have been read as a warm cache.
        expect(artifactLogs()).toEqual([]);

        host.settings.values.persistCodeLinkMap = true;
        await service.syncActivities(editor.id, entries);

        // warmLoaded stayed false while off, so the toggle-on sync loads it now.
        expect(artifactLogs()).toEqual([
            { level: "info", message: expect.stringContaining("warm cache: loaded 1") },
        ]);
    });

    it("handles a source change after a warm cache named an unknown kind", async () => {
        const worker = "/work/proj/src/Worker.java";
        const warm = warmArtifact(entry("Act", "bogus" as never, "pay"), ["src/Worker.java"]);
        const { service, editor, locator } = createService({
            persist: true,
            fileContents: { [ARTIFACT]: warm, [worker]: '@JobWorker(type = "pay")' },
        });
        // A failed resolve keeps whatever the warm cache put in the map.
        locator.resolveMany.mockRejectedValueOnce(new Error("listing failed"));
        await expect(
            service.syncActivities(editor.id, [entry("Act", "jobType", "pay")]),
        ).rejects.toThrow("listing failed");

        await expect(service.onSourceFileChanged(worker, "change", ROOT)).resolves.toBeUndefined();
    });
});

describe("CodeLinkMapService — live linking", () => {
    it("unlinks a deleted file and marks the activity unresolved", async () => {
        const worker = "/work/proj/src/Worker.java";
        const { service, editor } = createService({
            resolveMap: { pay: [worker] },
            fileContents: { [worker]: '"pay"' },
        });

        await service.syncActivities(editor.id, [entry("Act", "jobType", "pay")]);
        expect(lastStatus(editor)![implementationStatusKey("Act", "pay")]).toBe(true);

        await service.onSourceFileChanged(worker, "delete", ROOT);
        expect(lastStatus(editor)![implementationStatusKey("Act", "pay")]).toBe(false);
    });

    it("keeps a link when the saved file cannot be read", async () => {
        const worker = "/work/proj/src/Worker.java";
        const { service, host, editor } = createService({
            resolveMap: { pay: [worker] },
            fileContents: { [worker]: '@JobWorker(type = "pay")' },
        });
        await service.syncActivities(editor.id, [entry("Act", "jobType", "pay")]);
        vi.spyOn(host.workspace, "readFile").mockRejectedValueOnce(
            new Error("EBUSY: resource busy or locked"),
        );

        await service.onSourceFileChanged(worker, "change", ROOT);

        expect(lastStatus(editor)).toEqual({ [implementationStatusKey("Act", "pay")]: true });
        expect(host.notifier.logged("debug")).toEqual([
            expect.stringContaining(`${worker}: EBUSY: resource busy or locked`),
        ]);
    });

    it("unlinks the files of a folder deleted as one event", async () => {
        const worker = "/work/proj/src/pay/Worker.java";
        const { service, host, editor } = createService({
            resolveMap: { pay: [worker] },
            fileContents: { [worker]: '@JobWorker(type = "pay")' },
        });
        await service.syncActivities(editor.id, [entry("Act", "jobType", "pay")]);

        await host.workspace.deleteDirectory("/work/proj/src/pay");

        await vi.waitFor(() =>
            expect(lastStatus(editor)).toEqual({ [implementationStatusKey("Act", "pay")]: false }),
        );
    });

    it("links the files of a folder created as one event", async () => {
        const worker = "/work/proj/src/pay/sub/Worker.java";
        const { service, host, editor } = createService({
            fileContents: { "/work/proj/src/Other.java": "class Other {}" },
        });
        await service.syncActivities(editor.id, [entry("Act", "jobType", "pay")]);

        host.workspace.createDirectory("/work/proj/src/pay", {
            [worker]: '@JobWorker(type = "pay")',
        });

        await vi.waitFor(() =>
            expect(lastStatus(editor)).toEqual({ [implementationStatusKey("Act", "pay")]: true }),
        );
    });

    it("reads a file once when the folders above it are created at once", async () => {
        const worker = "/work/proj/src/pay/sub/Worker.java";
        const { service, host, editor } = createService({
            fileContents: { [worker]: '@JobWorker(type = "pay")' },
        });
        await service.syncActivities(editor.id, [entry("Act", "jobType", "pay")]);
        const readFile = vi.spyOn(host.workspace, "readFile");

        const created = Promise.all([
            service.onSourceFileChanged("/work/proj/src/pay", "create", ROOT),
            service.onSourceFileChanged("/work/proj/src/pay/sub", "create", ROOT),
        ]);
        await vi.runAllTimersAsync();
        await created;

        expect(lastStatus(editor)).toEqual({ [implementationStatusKey("Act", "pay")]: true });
        expect(readFile.mock.calls).toEqual([[worker]]);
    });

    it("does not push when a changed file is irrelevant to the map", async () => {
        const { service, editor } = createService({
            resolveMap: { "com.example.A": ["/work/proj/src/A.java"] },
            fileContents: { "/work/proj/src/Unrelated.java": "class Unrelated {}" },
        });
        await service.syncActivities(editor.id, [entry("Act", "javaClass", "com.example.A")]);
        const pushesBefore = editor.posted.length;

        await service.onSourceFileChanged("/work/proj/src/Unrelated.java", "change", ROOT);

        expect(editor.posted.length).toBe(pushesBefore);
    });

    it("only touches editors rooted at the changed file's root", async () => {
        const { service, editor } = createService({ resolveMap: { a: ["/p/a"] } });
        await service.syncActivities(editor.id, [entry("A", "jobType", "a")]);
        const pushesBefore = editor.posted.length;

        await service.onSourceFileChanged("/elsewhere/x.java", "change", "/other-root");

        expect(editor.posted.length).toBe(pushesBefore);
    });

    it("ignores a source change inside an excluded directory", async () => {
        const excluded = "/work/proj/target/generated/Worker.java";
        const { service, editor } = createService({
            resolveMap: {}, // unresolved at sync time
            fileContents: { [excluded]: '@JobWorker(type = "pay")' },
        });
        await service.syncActivities(editor.id, [entry("Act", "jobType", "pay")]);
        expect(lastStatus(editor)![implementationStatusKey("Act", "pay")]).toBe(false);
        const pushesBefore = editor.posted.length;

        // Were the excluded dir not filtered, this match would link and push.
        await service.onSourceFileChanged(excluded, "create", ROOT);

        expect(editor.posted.length).toBe(pushesBefore);
        expect(lastStatus(editor)![implementationStatusKey("Act", "pay")]).toBe(false);
    });

    it("follows a source change in a workspace below a build directory", async () => {
        const root = "/home/u/build/repo";
        const worker = `${root}/src/Worker.java`;
        const { service, editor } = createService({
            root,
            resolveMap: {},
            fileContents: { [worker]: '@JobWorker(type = "pay")' },
        });
        await service.syncActivities(editor.id, [entry("Act", "jobType", "pay")]);

        await service.onSourceFileChanged(worker, "create", root);

        expect(lastStatus(editor)).toEqual({ [implementationStatusKey("Act", "pay")]: true });
    });

    it("reads at apply time so the last event's content wins when reads resolve out of order", async () => {
        const worker = "/work/proj/src/Worker.java";
        const { service, host, editor } = createService({
            resolveMap: { pay: [worker] },
            fileContents: { [worker]: '@JobWorker(type = "pay")' },
        });
        await service.syncActivities(editor.id, [entry("Act", "jobType", "pay")]);
        expect(lastStatus(editor)![implementationStatusKey("Act", "pay")]).toBe(true);

        // A burst of two saves. Event #1 still matches but its read is made slow;
        // event #2 removed the binding and reads fast. Reading before queuing
        // (the old bug) would let the slow #1 apply last and wrongly re-link.
        // Reading inside the per-editor tail serializes by event order, so #2's
        // "no match" wins.
        const reads = [
            { content: '@JobWorker(type = "pay")', delay: 50 }, // event #1
            { content: "class Worker {}", delay: 10 }, // event #2
        ];
        let call = 0;
        vi.spyOn(host.workspace, "readFile").mockImplementation(
            () =>
                new Promise<string>((resolve) => {
                    const { content, delay } = reads[Math.min(call++, reads.length - 1)];
                    setTimeout(() => resolve(content), delay);
                }),
        );

        const first = service.onSourceFileChanged(worker, "change", ROOT);
        const second = service.onSourceFileChanged(worker, "change", ROOT);
        await vi.advanceTimersByTimeAsync(200);
        await Promise.all([first, second]);

        expect(lastStatus(editor)![implementationStatusKey("Act", "pay")]).toBe(false);
    });
});

describe("CodeLinkMapService — persistence", () => {
    it("writes the artifact to the mirrored path with relative paths when enabled", async () => {
        const abs = "/work/proj/src/main/java/com/example/A.java";
        const { service, host, editor } = createService({
            persist: true,
            resolveMap: { "com.example.A": [abs] },
        });

        await service.syncActivities(editor.id, [entry("Act", "javaClass", "com.example.A")]);
        await service.writeArtifact(editor.id);

        const written = JSON.parse(host.workspace.files.get(ARTIFACT)!);
        expect(written.bpmnFile).toBe("order.bpmn");
        expect(written.entries[0].paths).toEqual(["src/main/java/com/example/A.java"]);
    });

    it("names a nested diagram by its path below the root", async () => {
        const { service, host } = createService({ persist: true });
        const nested = host.openEditor("/work/proj/processes/order.bpmn");

        await service.syncActivities(nested.id, [entry("Act", "jobType", "pay")]);
        await service.writeArtifact(nested.id);

        const written = host.workspace.files.get(
            "/work/proj/.camunda/code-link/processes/order.bpmn.json",
        );
        expect(JSON.parse(written!).bpmnFile).toBe("processes/order.bpmn");
    });

    it("keeps a link to a file outside the diagram's root across a reopen", async () => {
        const abs = "/work/lib/src/main/java/com/example/A.java";
        const { service, host, editor, locator } = createService({
            persist: true,
            resolveMap: { "com.example.A": [abs] },
            fileContents: { [abs]: "class A {}" },
        });
        const entries = [entry("Act", "javaClass", "com.example.A")];

        await service.syncActivities(editor.id, entries);
        await service.writeArtifact(editor.id);
        service.disposeEditor(editor.id);
        await service.syncActivities(editor.id, entries);

        expect(JSON.parse(host.workspace.files.get(ARTIFACT)!).entries[0].paths).toEqual([
            "../lib/src/main/java/com/example/A.java",
        ]);
        expect(locator.resolveMany).toHaveBeenCalledTimes(1);
        expect(lastStatus(editor)).toEqual({
            [implementationStatusKey("Act", "com.example.A")]: true,
        });
    });

    it("writes the artifact under the UNC root of a workspace on a share", async () => {
        const root = "//server/share/proj";
        const { service, host, editor } = createService({
            persist: true,
            root,
            resolveMap: { "com.example.A": [`${root}/src/main/java/com/example/A.java`] },
        });

        await service.syncActivities(editor.id, [entry("Act", "javaClass", "com.example.A")]);
        await service.writeArtifact(editor.id);

        expect([...host.workspace.files.keys()]).toEqual([
            `${root}/.camunda/code-link/order.bpmn.json`,
        ]);
    });

    it("keeps the map in memory and writes nothing for a document outside its workspace root", async () => {
        const abs = "/work/proj/src/A.java";
        const { service, host, editor, artifactSvc } = createService({
            persist: true,
            resolveMap: { "com.example.A": [abs] },
        });
        artifactSvc.getWorkspaceRoot.mockResolvedValueOnce("/work/other");

        await service.syncActivities(editor.id, [entry("Act", "javaClass", "com.example.A")]);
        await service.writeArtifact(editor.id);

        expect(lastStatus(editor)).toEqual({
            [implementationStatusKey("Act", "com.example.A")]: true,
        });
        expect([...host.workspace.files.keys()]).toEqual([]);
        expect(host.notifier.logged("warning")).toContain(
            "[code-link] not persisting the map: No config artifact for /work/proj/order.bpmn: " +
                "it is not below the workspace root /work/other.",
        );
    });

    it("does not persist when the setting is off", async () => {
        const { service, host, editor } = createService({
            persist: false,
            resolveMap: { x: ["/p/x"] },
        });

        await service.syncActivities(editor.id, [entry("A", "jobType", "x")]);
        await vi.advanceTimersByTimeAsync(50);

        expect([...host.workspace.files.keys()]).toEqual([]);
    });

    it("skips rewriting the artifact when the map content is unchanged", async () => {
        const abs = "/work/proj/src/main/java/com/example/A.java";
        const { service, host, editor } = createService({
            persist: true,
            resolveMap: { "com.example.A": [abs] },
            fileContents: { [abs]: "class A {}" },
        });
        const writeFile = vi.spyOn(host.workspace, "writeFile");
        const entries = [entry("Act", "javaClass", "com.example.A")];

        await service.syncActivities(editor.id, entries);
        await service.writeArtifact(editor.id);
        await service.syncActivities(editor.id, entries);
        await service.writeArtifact(editor.id);

        expect(writeFile).toHaveBeenCalledTimes(1);
    });

    it("ignores an unreadable warm cache and resolves cold instead (persist on)", async () => {
        const { service, editor, locator } = createService({
            persist: true,
            resolveMap: { "com.example.A": ["/work/proj/src/A.java"] },
            fileContents: { [ARTIFACT]: "{ this is not valid json" },
        });

        await service.syncActivities(editor.id, [entry("Act", "javaClass", "com.example.A")]);

        // Bad cache ⇒ empty map ⇒ everything is "new" ⇒ a normal batched resolve.
        expect(locator.resolveMany).toHaveBeenCalledTimes(1);
    });

    it("swallows a write failure (never rejects the persist path)", async () => {
        const { service, host, editor } = createService({
            persist: true,
            resolveMap: { x: ["/p/x"] },
        });
        vi.spyOn(host.workspace, "writeFile").mockRejectedValueOnce(new Error("EACCES"));

        await service.syncActivities(editor.id, [entry("A", "jobType", "x")]);
        await expect(service.writeArtifact(editor.id)).resolves.toBeUndefined();
        expect(host.notifier.logged("warning")).toEqual([
            expect.stringContaining("failed to persist map: EACCES"),
        ]);
    });
});

describe("CodeLinkMapService — lifecycle", () => {
    it("keeps each editor's map independent", async () => {
        const { service, editor, secondEditor } = createService({
            resolveMap: { a: ["/p/a"], b: ["/p/b"] },
        });

        await service.syncActivities(editor.id, [entry("A", "jobType", "a")]);
        await service.syncActivities(secondEditor.id, [entry("B", "jobType", "b")]);
        await service.syncActivities(editor.id, []); // clear the first editor

        expect(lastStatus(editor)).toEqual({});
        expect(lastStatus(secondEditor)).toEqual({ [implementationStatusKey("B", "b")]: true });
    });

    it("shares one watcher per root and disposes it when the last editor closes", async () => {
        const { service, editor, secondEditor, watchers } = createService({
            resolveMap: { a: ["/p/a"] },
        });

        await service.syncActivities(editor.id, [entry("A", "jobType", "a")]);
        await service.syncActivities(secondEditor.id, [entry("A", "jobType", "a")]);

        expect(watchers.map(({ root }) => root)).toEqual([ROOT]);

        service.disposeEditor(editor.id);
        expect(watchers[0].disposed).toBe(false);

        service.disposeEditor(secondEditor.id);
        expect(watchers[0].disposed).toBe(true);
    });

    it("disposeEditor on an unknown editor is a no-op", () => {
        const { service } = createService();
        expect(() => service.disposeEditor("never-opened")).not.toThrow();
    });

    it("does not register an editor closed during its sync with the source index", async () => {
        const { service, editor, artifactSvc, sourceIndex, watchers } = createService({
            resolveMap: { a: ["/p/a"] },
        });
        let releaseRoot!: (root: string) => void;
        artifactSvc.getWorkspaceRoot.mockImplementationOnce(
            () =>
                new Promise<string>((resolve) => {
                    releaseRoot = resolve;
                }),
        );

        const sync = service.syncActivities(editor.id, [entry("A", "jobType", "a")]);
        await Promise.resolve();
        service.disposeEditor(editor.id);
        releaseRoot(ROOT);
        await sync;

        expect(sourceIndex.sourcesFor).not.toHaveBeenCalled();
        expect(watchers).toEqual([]);
    });

    it("pushes no status to an editor closed while its resolve ran", async () => {
        const { service, editor, locator } = createService();
        locator.resolveMany.mockImplementationOnce((entries: ImplementationEntry[]) => {
            service.disposeEditor(editor.id);
            return Promise.resolve(
                new Map(entries.map(({ activityId }) => [activityId, ["/p/a"]])),
            );
        });

        await service.syncActivities(editor.id, [entry("A", "jobType", "a")]);

        expect(lastStatus(editor)).toBeUndefined();
    });

    it("pushes no status to an editor closed while a changed file was read", async () => {
        const worker = "/work/proj/src/Worker.java";
        const { service, host, editor } = createService();
        await service.syncActivities(editor.id, [entry("Act", "jobType", "pay")]);
        const pushesBefore = editor.posted.length;
        vi.spyOn(host.workspace, "readFile").mockImplementationOnce(() => {
            service.disposeEditor(editor.id);
            return Promise.resolve('@JobWorker(type = "pay")');
        });

        await service.onSourceFileChanged(worker, "create", ROOT);

        expect(editor.posted.length).toBe(pushesBefore);
    });

    it("does not register an editor closed while its links were verified", async () => {
        const worker = "/work/proj/src/Worker.java";
        const { service, host, editor, sourceIndex } = createService({
            resolveMap: { pay: [worker] },
            fileContents: { [worker]: '@JobWorker(type = "pay")' },
        });
        await service.syncActivities(editor.id, [entry("Act", "jobType", "pay")]);
        sourceIndex.sourcesFor.mockClear();
        vi.spyOn(host.workspace, "readFile").mockImplementationOnce(() => {
            service.disposeEditor(editor.id);
            return Promise.resolve('@JobWorker(type = "pay")');
        });

        await service.syncActivities(editor.id, [
            entry("Act", "jobType", "pay"),
            entry("New", "jobType", "refund"),
        ]);

        expect(sourceIndex.sourcesFor).not.toHaveBeenCalled();
    });

    it("releases the editor's share of the source index when it closes", async () => {
        const { service, editor, sourceIndex } = createService({ resolveMap: { a: ["/p/a"] } });
        await service.syncActivities(editor.id, [entry("A", "jobType", "a")]);

        service.disposeEditor(editor.id);

        expect(sourceIndex.release).toHaveBeenCalledWith(editor.id);
    });

    it("dispose() tears down every outstanding watcher and the source index", async () => {
        const { service, editor, sourceIndex, watchers } = createService({
            resolveMap: { a: ["/p/a"] },
        });
        await service.syncActivities(editor.id, [entry("A", "jobType", "a")]);

        service.dispose();

        expect(watchers[0].disposed).toBe(true);
        expect(sourceIndex.dispose).toHaveBeenCalledOnce();
    });

    it("logs and continues when a status push fails (hidden editor)", async () => {
        const { service, host, editor } = createService({ resolveMap: { a: ["/p/a"] } });
        editor.hidden = true;

        await expect(
            service.syncActivities(editor.id, [entry("A", "jobType", "a")]),
        ).resolves.toBeUndefined();
        // A skipped push leaves the context pad briefly stale → warn, not info.
        expect(host.notifier.logged("warning")).toEqual([
            expect.stringContaining("status push skipped"),
        ]);
    });

    it("abandons a sync gracefully when the editor is disposed before it runs", async () => {
        const { service, host, editor, locator, watchers } = createService({
            resolveMap: { a: ["/p/a"] },
        });
        // The editor is torn down before runSync reaches attach.
        host.store.unregister(editor.id, editor);

        await expect(
            service.syncActivities(editor.id, [entry("A", "jobType", "a")]),
        ).resolves.toBeUndefined();

        // Attach bailed before acquiring a watcher or resolving anything, and the
        // orphan state was dropped — nothing leaks.
        expect(watchers).toEqual([]);
        expect(locator.resolveMany).not.toHaveBeenCalled();
        expect(host.notifier.logged("info")).toEqual([
            expect.stringContaining("disposed before attach"),
        ]);
    });

    it("clears a rejected attach so a later sync retries instead of staying wedged", async () => {
        const { service, editor, artifactSvc, watchers } = createService({
            resolveMap: { a: ["/p/a"] },
        });
        // First attach rejects (e.g. a transient workspace-root lookup failure).
        artifactSvc.getWorkspaceRoot.mockRejectedValueOnce(new Error("transient"));

        await expect(
            service.syncActivities(editor.id, [entry("A", "jobType", "a")]),
        ).rejects.toThrow("transient");

        // The cached attachPromise was cleared, so the next sync re-attaches.
        await expect(
            service.syncActivities(editor.id, [entry("A", "jobType", "a")]),
        ).resolves.toBeUndefined();
        expect(watchers).toHaveLength(1);
    });
});
