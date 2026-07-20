import { describe, expect, it, vi } from "vitest";

import { FileNotFound } from "@miragon/bpmn-modeler-core";

import { ScriptFileStore } from "./ScriptFileStore";

const EDITOR_ID = "file:///ws/process.bpmn";

function createStore(overrides?: {
    getDocumentDirectory?: (document: string) => string;
    workspaceFolders?: string[];
    gitignoreExists?: boolean;
}) {
    const written = new Map<string, string>();
    const deleted: string[] = [];
    const workspace = {
        getDocumentDirectory: overrides?.getDocumentDirectory ?? (() => "/ws"),
        getWorkspaceFolderPaths: () => overrides?.workspaceFolders ?? ["/ws"],
        readFile: vi.fn(async (path: string) => {
            if (path.endsWith(".gitignore") && overrides?.gitignoreExists) {
                return "*";
            }
            throw new FileNotFound(path);
        }),
        writeFile: vi.fn(async (path: string, content: string) => {
            written.set(path, content);
        }),
        deleteDirectory: vi.fn(async (path: string) => {
            deleted.push(path);
        }),
    };
    const settings = { getConfigFolder: () => ".camunda" };
    const artifactSvc = { getWorkspaceRoot: vi.fn(async () => "/ws") };
    const store = new ScriptFileStore(workspace as never, settings as never, artifactSvc as never);
    return { store, workspace, artifactSvc, written, deleted };
}

describe("ScriptFileStore.resolveBaseDir", () => {
    it("resolves under the workspace root's config folder with the marker segments", async () => {
        const { store } = createStore();
        expect(await store.resolveBaseDir(EDITOR_ID)).toBe("/ws/.camunda/tmp/scripting");
    });

    it("falls back to the OS temp dir, keeping the marker segments, when resolution fails", async () => {
        const { store } = createStore({
            getDocumentDirectory: () => {
                throw new Error("not a file path");
            },
        });
        const baseDir = await store.resolveBaseDir("untitled:foo");
        expect(baseDir).toContain("miragon-bpmn-modeler");
        expect(baseDir.endsWith("/tmp/scripting")).toBe(true);
    });
});

describe("ScriptFileStore.ensureGitignore", () => {
    it("writes a catch-all .gitignore into the tmp dir when absent", async () => {
        const { store, written } = createStore();
        await store.ensureGitignore("/ws/.camunda/tmp/scripting");
        expect(written.get("/ws/.camunda/tmp/.gitignore")).toBe("*\n");
    });

    it("does not overwrite an existing .gitignore — a user edit is not fought", async () => {
        const { store, written } = createStore({ gitignoreExists: true });
        await store.ensureGitignore("/ws/.camunda/tmp/scripting");
        expect(written.size).toBe(0);
    });
});

describe("ScriptFileStore.prepareBaseDir", () => {
    it("sweeps the base dir the first time it is used", async () => {
        const { store, deleted } = createStore();
        await store.prepareBaseDir("/ws/.camunda/tmp/scripting");
        expect(deleted).toEqual(["/ws/.camunda/tmp/scripting"]);
    });

    it("sweeps each base dir only once per process", async () => {
        const { store, deleted } = createStore();
        await store.prepareBaseDir("/ws/.camunda/tmp/scripting");
        await store.prepareBaseDir("/ws/.camunda/tmp/scripting");
        expect(deleted).toEqual(["/ws/.camunda/tmp/scripting"]);
    });

    it("does not sweep a base dir that was already marked swept", async () => {
        const { store, deleted } = createStore();
        store.markSwept("/ws/.camunda/tmp/scripting");
        await store.prepareBaseDir("/ws/.camunda/tmp/scripting");
        expect(deleted).toEqual([]);
    });

    it("swallows a sweep failure so it cannot block a script write", async () => {
        const { store, workspace, deleted } = createStore();
        workspace.deleteDirectory.mockRejectedValueOnce(new Error("EBUSY"));
        await expect(store.prepareBaseDir("/ws/.camunda/tmp/scripting")).resolves.toBeUndefined();
        // Marked swept despite the failure — a re-attempt is a no-op (no retry
        // storm on the next write).
        await store.prepareBaseDir("/ws/.camunda/tmp/scripting");
        expect(deleted).toEqual([]);
    });
});
