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

describe("ScriptFileStore.sweepOrphans", () => {
    it("sweeps every workspace folder's scripting dir plus the tmpdir fallback", async () => {
        const { store, deleted } = createStore({ workspaceFolders: ["/ws", "/other"] });
        await store.sweepOrphans();
        expect(deleted).toContain("/ws/.camunda/tmp/scripting");
        expect(deleted).toContain("/other/.camunda/tmp/scripting");
        expect(deleted.some((path) => path.includes("miragon-bpmn-modeler"))).toBe(true);
    });
});
