import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ImplementationStatusQuery } from "@miragon/bpmn-modeler-shared";
import { ImplementationEntry, implementationStatusKey } from "@miragon/bpmn-modeler-types";

import { createTestHost, FakeEditorHandle } from "../../testing";
import { buildMapJson } from "../domain/CodeLinkMap";
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
    } = {},
) {
    const resolveMap = opts.resolveMap ?? {};
    const host = createTestHost({
        folders: [ROOT],
        files: opts.fileContents,
        settings: { persistCodeLinkMap: opts.persist ?? false },
    });
    const editor = host.openEditor(DOC);
    const secondEditor = host.openEditor(SECOND_DOC);
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

    const artifactSvc = { getWorkspaceRoot: vi.fn(() => Promise.resolve(ROOT)) };

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

    it("re-resolves when a reference changes", async () => {
        const { service, editor, locator } = createService({
            resolveMap: { "com.example.A": ["/p/A.java"], "com.example.B": ["/p/B.java"] },
        });

        await service.syncActivities(editor.id, [entry("Act", "javaClass", "com.example.A")]);
        await service.syncActivities(editor.id, [entry("Act", "javaClass", "com.example.B")]);

        expect(locator.resolveMany).toHaveBeenCalledTimes(2);
        expect(locator.resolveMany.mock.calls[1][0]).toEqual([
            entry("Act", "javaClass", "com.example.B"),
        ]);
    });

    it("drops a removed activity from the pushed status", async () => {
        const { service, editor } = createService({
            resolveMap: { a: ["/p/a"], b: ["/p/b"] },
        });

        await service.syncActivities(editor.id, [
            entry("A", "jobType", "a"),
            entry("B", "jobType", "b"),
        ]);
        await service.syncActivities(editor.id, [entry("A", "jobType", "a")]);

        expect(Object.keys(lastStatus(editor)!)).toEqual([implementationStatusKey("A", "a")]);
    });

    it("filters out malformed entries (unknown kind, empty fields)", async () => {
        const { service, editor, locator } = createService({ resolveMap: { x: ["/p/x"] } });

        await service.syncActivities(editor.id, [
            entry("A", "jobType", "x"),
            { activityId: "", kind: "jobType", reference: "y" },
            { activityId: "B", kind: "bogus" as never, reference: "z" },
        ]);

        expect(locator.resolveMany.mock.calls[0][0]).toEqual([entry("A", "jobType", "x")]);
        expect(Object.keys(lastStatus(editor)!)).toEqual([implementationStatusKey("A", "x")]);
    });
});

describe("CodeLinkMapService — warm cache", () => {
    it("loads the artifact and verifies, skipping the batched resolve (persist on)", async () => {
        const abs = "/work/proj/src/main/java/com/example/A.java";
        const warm = JSON.stringify(
            buildMapJson({
                bpmnFile: "order.bpmn",
                generatedAt: "t",
                workspaceRoot: ROOT,
                entries: [
                    {
                        activityId: "Act",
                        kind: "javaClass",
                        reference: "com.example.A",
                        resolved: true,
                        paths: [abs],
                    },
                ],
            }),
        );
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
        const warm = JSON.stringify(
            buildMapJson({
                bpmnFile: "order.bpmn",
                generatedAt: "t",
                workspaceRoot: ROOT,
                entries: [
                    {
                        activityId: "Act",
                        kind: "javaClass",
                        reference: "com.example.A",
                        resolved: true,
                        paths: [abs],
                    },
                ],
            }),
        );
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
});

describe("CodeLinkMapService — live linking", () => {
    it("links a freshly-written worker to an unresolved activity", async () => {
        const worker = "/work/proj/src/Worker.java";
        const { service, editor } = createService({
            resolveMap: {}, // nothing resolves at sync time
            fileContents: { [worker]: '@JobWorker(type = "pay")' },
        });

        await service.syncActivities(editor.id, [entry("Act", "jobType", "pay")]);
        expect(lastStatus(editor)).toEqual({
            [implementationStatusKey("Act", "pay")]: false,
        });

        await service.onSourceFileChanged(worker, "created", ROOT);
        expect(lastStatus(editor)).toEqual({
            [implementationStatusKey("Act", "pay")]: true,
        });
    });

    it("unlinks a deleted file and marks the activity unresolved", async () => {
        const worker = "/work/proj/src/Worker.java";
        const { service, editor } = createService({
            resolveMap: { pay: [worker] },
            fileContents: { [worker]: '"pay"' },
        });

        await service.syncActivities(editor.id, [entry("Act", "jobType", "pay")]);
        expect(lastStatus(editor)![implementationStatusKey("Act", "pay")]).toBe(true);

        await service.onSourceFileChanged(worker, "deleted", ROOT);
        expect(lastStatus(editor)![implementationStatusKey("Act", "pay")]).toBe(false);
    });

    it("does not push when a changed file is irrelevant to the map", async () => {
        const { service, editor } = createService({
            resolveMap: { "com.example.A": ["/work/proj/src/A.java"] },
            fileContents: { "/work/proj/src/Unrelated.java": "class Unrelated {}" },
        });
        await service.syncActivities(editor.id, [entry("Act", "javaClass", "com.example.A")]);
        const pushesBefore = editor.posted.length;

        await service.onSourceFileChanged("/work/proj/src/Unrelated.java", "changed", ROOT);

        expect(editor.posted.length).toBe(pushesBefore);
    });

    it("unlinks when an edit removes the binding from an already-linked file", async () => {
        const worker = "/work/proj/src/Worker.java";
        const { service, host, editor } = createService({
            resolveMap: { pay: [worker] },
            fileContents: { [worker]: '@JobWorker(type = "pay")' },
        });
        await service.syncActivities(editor.id, [entry("Act", "jobType", "pay")]);
        expect(lastStatus(editor)![implementationStatusKey("Act", "pay")]).toBe(true);

        // The annotation is edited away — same file, no longer matches. Set
        // without a watcher event so only the explicit change below applies.
        host.workspace.files.set(worker, '@JobWorker(type = "other")');
        await service.onSourceFileChanged(worker, "changed", ROOT);

        expect(lastStatus(editor)![implementationStatusKey("Act", "pay")]).toBe(false);
    });

    it("links an additional implementing file to an already-resolved activity", async () => {
        const first = "/work/proj/src/W1.java";
        const second = "/work/proj/src/W2.java";
        const { service, editor } = createService({
            resolveMap: { pay: [first] },
            fileContents: { [first]: '"pay"', [second]: '"pay"' },
        });
        await service.syncActivities(editor.id, [entry("Act", "jobType", "pay")]);
        const pushesBefore = editor.posted.length;

        await service.onSourceFileChanged(second, "created", ROOT);

        // Still resolved, but the second file produced a push (paths changed).
        expect(editor.posted.length).toBe(pushesBefore + 1);
        expect(lastStatus(editor)![implementationStatusKey("Act", "pay")]).toBe(true);
    });

    it("only touches editors rooted at the changed file's root", async () => {
        const { service, editor } = createService({ resolveMap: { a: ["/p/a"] } });
        await service.syncActivities(editor.id, [entry("A", "jobType", "a")]);
        const pushesBefore = editor.posted.length;

        await service.onSourceFileChanged("/elsewhere/x.java", "changed", "/other-root");

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
        await service.onSourceFileChanged(excluded, "created", ROOT);

        expect(editor.posted.length).toBe(pushesBefore);
        expect(lastStatus(editor)![implementationStatusKey("Act", "pay")]).toBe(false);
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

        const first = service.onSourceFileChanged(worker, "changed", ROOT);
        const second = service.onSourceFileChanged(worker, "changed", ROOT);
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
