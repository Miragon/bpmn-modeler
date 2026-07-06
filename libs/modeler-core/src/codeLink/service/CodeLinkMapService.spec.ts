import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ImplementationEntry, implementationStatusKey } from "@miragon/bpmn-modeler-shared";

import { buildMapJson } from "../domain/CodeLinkMap";
import { CodeLinkMapService } from "./CodeLinkMapService";

const ROOT = "/work/proj";
const DOC = "/work/proj/order.bpmn";
const ARTIFACT = "/work/proj/.camunda/code-link/order.bpmn.json";

interface PushedStatus {
    editorId: string;
    resolved: Record<string, boolean>;
}

/**
 * Builds the service against in-memory stubs. `resolveMap` keys a reference to
 * the paths a batched resolve returns; `fileContents` backs both verification
 * reads and the warm-cache load.
 */
function createService(
    opts: {
        persist?: boolean;
        resolveMap?: Record<string, string[]>;
        fileContents?: Record<string, string>;
    } = {},
) {
    const resolveMap = opts.resolveMap ?? {};
    const fileContents = { ...(opts.fileContents ?? {}) };

    const pushed: PushedStatus[] = [];
    const editorStore = {
        requireHandle: vi.fn(() => ({
            documentPath: () => DOC,
            documentFsPath: () => DOC,
        })),
        postMessage: vi.fn((editorId: string, message: { resolved: Record<string, boolean> }) => {
            pushed.push({ editorId, resolved: message.resolved });
            return Promise.resolve(true);
        }),
    };

    const locator = {
        resolveMany: vi.fn((entries: ImplementationEntry[]) =>
            Promise.resolve(
                new Map(
                    entries.map((entry) => [entry.activityId, resolveMap[entry.reference] ?? []]),
                ),
            ),
        ),
    };

    const artifactSvc = { getWorkspaceRoot: vi.fn(() => Promise.resolve(ROOT)) };

    const createdWatchers: { dispose: ReturnType<typeof vi.fn> }[] = [];
    const writes: Record<string, string> = {};
    const vsWorkspace = {
        readFile: vi.fn((path: string) =>
            path in fileContents
                ? Promise.resolve(fileContents[path])
                : Promise.reject(new Error("ENOENT")),
        ),
        writeFile: vi.fn((path: string, content: string) => {
            writes[path] = content;
            return Promise.resolve();
        }),
        createWatcher: vi.fn(() => {
            const handle = { dispose: vi.fn() };
            createdWatchers.push(handle);
            return handle;
        }),
    };

    const vsSettings = {
        getPersistCodeLinkMap: vi.fn(() => opts.persist ?? false),
        getConfigFolder: vi.fn(() => ".camunda"),
    };
    const notifier = {
        logDebug: vi.fn(),
        logInfo: vi.fn(),
        logWarning: vi.fn(),
        logError: vi.fn(),
    };

    const service = new CodeLinkMapService(
        editorStore as never,
        locator as never,
        artifactSvc as never,
        vsWorkspace as never,
        vsSettings as never,
        notifier as never,
        10,
    );

    const lastStatus = (editorId: string) =>
        [...pushed].reverse().find((push) => push.editorId === editorId)?.resolved;

    return {
        service,
        locator,
        vsWorkspace,
        vsSettings,
        artifactSvc,
        editorStore,
        notifier,
        writes,
        createdWatchers,
        lastStatus,
        pushed,
        fileContents,
    };
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
        const { service, locator, lastStatus } = createService({
            resolveMap: { "com.example.A": [abs] },
        });

        await service.syncActivities("editor1", [entry("Act_A", "javaClass", "com.example.A")]);

        expect(locator.resolveMany).toHaveBeenCalledTimes(1);
        expect(lastStatus("editor1")).toEqual({
            [implementationStatusKey("Act_A", "com.example.A")]: true,
        });
    });

    it("verifies an unchanged resolved entry with a read instead of re-resolving", async () => {
        const abs = "/work/proj/src/main/java/com/example/A.java";
        const { service, locator, vsWorkspace } = createService({
            resolveMap: { "com.example.A": [abs] },
            fileContents: { [abs]: "class A {}" },
        });
        const entries = [entry("Act", "javaClass", "com.example.A")];

        await service.syncActivities("editor1", entries);
        vsWorkspace.readFile.mockClear();
        await service.syncActivities("editor1", entries);

        expect(locator.resolveMany).toHaveBeenCalledTimes(1); // not re-resolved
        expect(vsWorkspace.readFile).toHaveBeenCalledWith(abs); // verified by a single read
    });

    it("re-resolves when a reference changes", async () => {
        const { service, locator } = createService({
            resolveMap: { "com.example.A": ["/p/A.java"], "com.example.B": ["/p/B.java"] },
        });

        await service.syncActivities("editor1", [entry("Act", "javaClass", "com.example.A")]);
        await service.syncActivities("editor1", [entry("Act", "javaClass", "com.example.B")]);

        expect(locator.resolveMany).toHaveBeenCalledTimes(2);
        expect(locator.resolveMany.mock.calls[1][0]).toEqual([
            entry("Act", "javaClass", "com.example.B"),
        ]);
    });

    it("drops a removed activity from the pushed status", async () => {
        const { service, lastStatus } = createService({
            resolveMap: { a: ["/p/a"], b: ["/p/b"] },
        });

        await service.syncActivities("editor1", [
            entry("A", "jobType", "a"),
            entry("B", "jobType", "b"),
        ]);
        await service.syncActivities("editor1", [entry("A", "jobType", "a")]);

        expect(Object.keys(lastStatus("editor1")!)).toEqual([implementationStatusKey("A", "a")]);
    });

    it("filters out malformed entries (unknown kind, empty fields)", async () => {
        const { service, locator, lastStatus } = createService({ resolveMap: { x: ["/p/x"] } });

        await service.syncActivities("editor1", [
            entry("A", "jobType", "x"),
            { activityId: "", kind: "jobType", reference: "y" },
            { activityId: "B", kind: "bogus" as never, reference: "z" },
        ]);

        expect(locator.resolveMany.mock.calls[0][0]).toEqual([entry("A", "jobType", "x")]);
        expect(Object.keys(lastStatus("editor1")!)).toEqual([implementationStatusKey("A", "x")]);
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
        const { service, locator, lastStatus } = createService({
            persist: true,
            fileContents: { [ARTIFACT]: warm, [abs]: "class A {}" },
        });

        await service.syncActivities("editor1", [entry("Act", "javaClass", "com.example.A")]);

        expect(locator.resolveMany).not.toHaveBeenCalled();
        expect(lastStatus("editor1")).toEqual({
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
        const { service, vsWorkspace, vsSettings } = createService({
            persist: false,
            resolveMap: { "com.example.A": [abs] },
            fileContents: { [ARTIFACT]: warm, [abs]: "class A {}" },
        });
        const entries = [entry("Act", "javaClass", "com.example.A")];

        await service.syncActivities("editor1", entries);
        // Persist off: the artifact must not have been read as a warm cache.
        expect(vsWorkspace.readFile).not.toHaveBeenCalledWith(ARTIFACT);

        vsSettings.getPersistCodeLinkMap.mockReturnValue(true);
        await service.syncActivities("editor1", entries);

        // warmLoaded stayed false while off, so the toggle-on sync loads it now.
        expect(vsWorkspace.readFile).toHaveBeenCalledWith(ARTIFACT);
    });
});

describe("CodeLinkMapService — live linking", () => {
    it("links a freshly-written worker to an unresolved activity", async () => {
        const worker = "/work/proj/src/Worker.java";
        const { service, lastStatus } = createService({
            resolveMap: {}, // nothing resolves at sync time
            fileContents: { [worker]: '@JobWorker(type = "pay")' },
        });

        await service.syncActivities("editor1", [entry("Act", "jobType", "pay")]);
        expect(lastStatus("editor1")).toEqual({
            [implementationStatusKey("Act", "pay")]: false,
        });

        await service.onSourceFileChanged(worker, "created", ROOT);
        expect(lastStatus("editor1")).toEqual({
            [implementationStatusKey("Act", "pay")]: true,
        });
    });

    it("unlinks a deleted file and marks the activity unresolved", async () => {
        const worker = "/work/proj/src/Worker.java";
        const { service, lastStatus } = createService({
            resolveMap: { pay: [worker] },
            fileContents: { [worker]: '"pay"' },
        });

        await service.syncActivities("editor1", [entry("Act", "jobType", "pay")]);
        expect(lastStatus("editor1")![implementationStatusKey("Act", "pay")]).toBe(true);

        await service.onSourceFileChanged(worker, "deleted", ROOT);
        expect(lastStatus("editor1")![implementationStatusKey("Act", "pay")]).toBe(false);
    });

    it("does not push when a changed file is irrelevant to the map", async () => {
        const { service, pushed } = createService({
            resolveMap: { "com.example.A": ["/work/proj/src/A.java"] },
            fileContents: { "/work/proj/src/Unrelated.java": "class Unrelated {}" },
        });
        await service.syncActivities("editor1", [entry("Act", "javaClass", "com.example.A")]);
        const pushesBefore = pushed.length;

        await service.onSourceFileChanged("/work/proj/src/Unrelated.java", "changed", ROOT);

        expect(pushed.length).toBe(pushesBefore);
    });

    it("unlinks when an edit removes the binding from an already-linked file", async () => {
        const worker = "/work/proj/src/Worker.java";
        const { service, lastStatus, fileContents } = createService({
            resolveMap: { pay: [worker] },
            fileContents: { [worker]: '@JobWorker(type = "pay")' },
        });
        await service.syncActivities("editor1", [entry("Act", "jobType", "pay")]);
        expect(lastStatus("editor1")![implementationStatusKey("Act", "pay")]).toBe(true);

        // The annotation is edited away — same file, no longer matches.
        fileContents[worker] = '@JobWorker(type = "other")';
        await service.onSourceFileChanged(worker, "changed", ROOT);

        expect(lastStatus("editor1")![implementationStatusKey("Act", "pay")]).toBe(false);
    });

    it("links an additional implementing file to an already-resolved activity", async () => {
        const first = "/work/proj/src/W1.java";
        const second = "/work/proj/src/W2.java";
        const { service, pushed } = createService({
            resolveMap: { pay: [first] },
            fileContents: { [first]: '"pay"', [second]: '"pay"' },
        });
        await service.syncActivities("editor1", [entry("Act", "jobType", "pay")]);
        const pushesBefore = pushed.length;

        await service.onSourceFileChanged(second, "created", ROOT);

        // Still resolved, but the second file produced a push (paths changed).
        expect(pushed.length).toBe(pushesBefore + 1);
        expect(pushed[pushed.length - 1].resolved[implementationStatusKey("Act", "pay")]).toBe(
            true,
        );
    });

    it("only touches editors rooted at the changed file's root", async () => {
        const { service, pushed } = createService({ resolveMap: { a: ["/p/a"] } });
        await service.syncActivities("editor1", [entry("A", "jobType", "a")]);
        const pushesBefore = pushed.length;

        await service.onSourceFileChanged("/elsewhere/x.java", "changed", "/other-root");

        expect(pushed.length).toBe(pushesBefore);
    });

    it("ignores a source change inside an excluded directory", async () => {
        const excluded = "/work/proj/target/generated/Worker.java";
        const { service, lastStatus, pushed } = createService({
            resolveMap: {}, // unresolved at sync time
            fileContents: { [excluded]: '@JobWorker(type = "pay")' },
        });
        await service.syncActivities("editor1", [entry("Act", "jobType", "pay")]);
        expect(lastStatus("editor1")![implementationStatusKey("Act", "pay")]).toBe(false);
        const pushesBefore = pushed.length;

        // Were the excluded dir not filtered, this match would link and push.
        await service.onSourceFileChanged(excluded, "created", ROOT);

        expect(pushed.length).toBe(pushesBefore);
        expect(lastStatus("editor1")![implementationStatusKey("Act", "pay")]).toBe(false);
    });

    it("reads at apply time so the last event's content wins when reads resolve out of order", async () => {
        const worker = "/work/proj/src/Worker.java";
        const { service, lastStatus, vsWorkspace } = createService({
            resolveMap: { pay: [worker] },
            fileContents: { [worker]: '@JobWorker(type = "pay")' },
        });
        await service.syncActivities("editor1", [entry("Act", "jobType", "pay")]);
        expect(lastStatus("editor1")![implementationStatusKey("Act", "pay")]).toBe(true);

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
        vsWorkspace.readFile.mockImplementation(
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

        expect(lastStatus("editor1")![implementationStatusKey("Act", "pay")]).toBe(false);
    });
});

describe("CodeLinkMapService — persistence", () => {
    it("writes the artifact to the mirrored path with relative paths when enabled", async () => {
        const abs = "/work/proj/src/main/java/com/example/A.java";
        const { service, vsWorkspace, writes } = createService({
            persist: true,
            resolveMap: { "com.example.A": [abs] },
        });

        await service.syncActivities("editor1", [entry("Act", "javaClass", "com.example.A")]);
        await service.writeArtifact("editor1");

        expect(vsWorkspace.writeFile).toHaveBeenCalled();
        const written = JSON.parse(writes[ARTIFACT]);
        expect(written.bpmnFile).toBe("order.bpmn");
        expect(written.entries[0].paths).toEqual(["src/main/java/com/example/A.java"]);
    });

    it("does not persist when the setting is off", async () => {
        const { service, vsWorkspace } = createService({
            persist: false,
            resolveMap: { x: ["/p/x"] },
        });

        await service.syncActivities("editor1", [entry("A", "jobType", "x")]);
        await vi.advanceTimersByTimeAsync(50);

        expect(vsWorkspace.writeFile).not.toHaveBeenCalled();
    });

    it("skips rewriting the artifact when the map content is unchanged", async () => {
        const abs = "/work/proj/src/main/java/com/example/A.java";
        const { service, vsWorkspace } = createService({
            persist: true,
            resolveMap: { "com.example.A": [abs] },
            fileContents: { [abs]: "class A {}" },
        });
        const entries = [entry("Act", "javaClass", "com.example.A")];

        await service.syncActivities("editor1", entries);
        await service.writeArtifact("editor1");
        await service.syncActivities("editor1", entries);
        await service.writeArtifact("editor1");

        expect(vsWorkspace.writeFile).toHaveBeenCalledTimes(1);
    });

    it("ignores an unreadable warm cache and resolves cold instead (persist on)", async () => {
        const { service, locator } = createService({
            persist: true,
            resolveMap: { "com.example.A": ["/work/proj/src/A.java"] },
            fileContents: { [ARTIFACT]: "{ this is not valid json" },
        });

        await service.syncActivities("editor1", [entry("Act", "javaClass", "com.example.A")]);

        // Bad cache ⇒ empty map ⇒ everything is "new" ⇒ a normal batched resolve.
        expect(locator.resolveMany).toHaveBeenCalledTimes(1);
    });

    it("swallows a write failure (never rejects the persist path)", async () => {
        const { service, vsWorkspace } = createService({
            persist: true,
            resolveMap: { x: ["/p/x"] },
        });
        vsWorkspace.writeFile.mockRejectedValueOnce(new Error("EACCES"));

        await service.syncActivities("editor1", [entry("A", "jobType", "x")]);
        await expect(service.writeArtifact("editor1")).resolves.toBeUndefined();
    });
});

describe("CodeLinkMapService — lifecycle", () => {
    it("keeps each editor's map independent", async () => {
        const { service, lastStatus } = createService({
            resolveMap: { a: ["/p/a"], b: ["/p/b"] },
        });

        await service.syncActivities("editor1", [entry("A", "jobType", "a")]);
        await service.syncActivities("editor2", [entry("B", "jobType", "b")]);
        await service.syncActivities("editor1", []); // clear editor1

        expect(lastStatus("editor1")).toEqual({});
        expect(lastStatus("editor2")).toEqual({ [implementationStatusKey("B", "b")]: true });
    });

    it("shares one watcher per root and disposes it when the last editor closes", async () => {
        const { service, vsWorkspace, createdWatchers } = createService({
            resolveMap: { a: ["/p/a"] },
        });

        await service.syncActivities("editor1", [entry("A", "jobType", "a")]);
        await service.syncActivities("editor2", [entry("A", "jobType", "a")]);

        expect(vsWorkspace.createWatcher).toHaveBeenCalledTimes(1);

        service.disposeEditor("editor1");
        expect(createdWatchers[0].dispose).not.toHaveBeenCalled();

        service.disposeEditor("editor2");
        expect(createdWatchers[0].dispose).toHaveBeenCalledTimes(1);
    });

    it("disposeEditor on an unknown editor is a no-op", () => {
        const { service } = createService();
        expect(() => service.disposeEditor("never-opened")).not.toThrow();
    });

    it("dispose() tears down every outstanding watcher", async () => {
        const { service, createdWatchers } = createService({ resolveMap: { a: ["/p/a"] } });
        await service.syncActivities("editor1", [entry("A", "jobType", "a")]);

        service.dispose();

        expect(createdWatchers[0].dispose).toHaveBeenCalledTimes(1);
    });

    it("logs and continues when a status push fails (hidden editor)", async () => {
        const { service, editorStore, notifier } = createService({ resolveMap: { a: ["/p/a"] } });
        editorStore.postMessage.mockRejectedValueOnce(new Error("The active editor is hidden."));

        await expect(
            service.syncActivities("editor1", [entry("A", "jobType", "a")]),
        ).resolves.toBeUndefined();
        // A skipped push leaves the context pad briefly stale → warn, not info.
        expect(notifier.logWarning).toHaveBeenCalledWith(
            expect.stringContaining("status push skipped"),
        );
    });

    it("abandons a sync gracefully when the editor is disposed before it runs", async () => {
        const { service, editorStore, locator, notifier, createdWatchers } = createService({
            resolveMap: { a: ["/p/a"] },
        });
        // The editor is torn down between the sync being queued and runSync
        // reaching attach: requireHandle now throws.
        editorStore.requireHandle.mockImplementation(() => {
            throw new Error("No editor found for id: editor1");
        });

        await expect(
            service.syncActivities("editor1", [entry("A", "jobType", "a")]),
        ).resolves.toBeUndefined();

        // Attach bailed before acquiring a watcher or resolving anything, and the
        // orphan state was dropped — nothing leaks.
        expect(createdWatchers.length).toBe(0);
        expect(locator.resolveMany).not.toHaveBeenCalled();
        expect(notifier.logInfo).toHaveBeenCalledWith(
            expect.stringContaining("disposed before attach"),
        );
    });

    it("clears a rejected attach so a later sync retries instead of staying wedged", async () => {
        const { service, artifactSvc, createdWatchers } = createService({
            resolveMap: { a: ["/p/a"] },
        });
        // First attach rejects (e.g. a transient workspace-root lookup failure).
        artifactSvc.getWorkspaceRoot.mockRejectedValueOnce(new Error("transient"));

        await expect(
            service.syncActivities("editor1", [entry("A", "jobType", "a")]),
        ).rejects.toThrow("transient");

        // The cached attachPromise was cleared, so the next sync re-attaches.
        await expect(
            service.syncActivities("editor1", [entry("A", "jobType", "a")]),
        ).resolves.toBeUndefined();
        expect(createdWatchers.length).toBe(1);
    });
});
