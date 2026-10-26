import { tmpdir } from "os";

import { describe, expect, it, vi } from "vitest";

import {
    ArtifactService,
    DirectoryNotFound,
    EditorSessionStore,
    FileNotFound,
    NoWorkspaceFolderFoundError,
} from "@miragon/bpmn-modeler-core";
import { FakeEditorHandle, InMemorySettings } from "@miragon/bpmn-modeler-core/testing";

import { keepsScriptsInOsTemp, ScriptFileStore } from "./ScriptFileStore";

function createStore(overrides?: { gitignoreExists?: boolean }) {
    const fileDiagram = new FakeEditorHandle("/ws/process.bpmn");
    const untitledDiagram = new FakeEditorHandle("Untitled-1", { scheme: "untitled" });
    const editorStore = new EditorSessionStore(() => undefined);
    editorStore.register(fileDiagram);
    editorStore.register(untitledDiagram);

    const written = new Map<string, string>();
    const deleted: string[] = [];
    const workspace = {
        // Like VsCodeWorkspace, which maps an id that is not a `file://` URI
        // through `Uri.file` and so answers `/` for `untitled:Untitled-1`.
        getDocumentDirectory: (editorId: string) => (editorId === fileDiagram.id ? "/ws" : "/"),
        getWorkspaceFolderForDocument: (document: string) => {
            if (document !== "/ws") {
                throw new NoWorkspaceFolderFoundError();
            }
            return "/ws";
        },
        readDirectory: async (path: string) => {
            throw new DirectoryNotFound(path);
        },
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
    const settings = new InMemorySettings();
    const artifactSvc = new ArtifactService(workspace as never, settings);
    const store = new ScriptFileStore(editorStore, workspace as never, settings, artifactSvc);
    return { store, workspace, written, deleted, fileDiagram, untitledDiagram };
}

describe("keepsScriptsInOsTemp", () => {
    it.each([
        { documentScheme: "file", inOsTemp: false },
        { documentScheme: "untitled", inOsTemp: true },
        { documentScheme: "vscode-vfs", inOsTemp: true },
        { documentScheme: "git", inOsTemp: true },
    ])(
        "$documentScheme: documents keep their scripts in the OS temp folder: $inOsTemp",
        ({ documentScheme, inOsTemp }) => {
            expect(keepsScriptsInOsTemp(documentScheme)).toBe(inOsTemp);
        },
    );
});

describe("ScriptFileStore.resolveBaseDir", () => {
    it("resolves under the workspace root's config folder with the marker segments", async () => {
        const { store, fileDiagram } = createStore();
        expect(await store.resolveBaseDir(fileDiagram.id)).toBe("/ws/.camunda/tmp/scripting");
    });

    it("keeps the scripts of an untitled diagram in the OS temp folder", async () => {
        const { store, untitledDiagram } = createStore();
        expect(await store.resolveBaseDir(untitledDiagram.id)).toBe(
            `${tmpdir().replace(/\\/g, "/")}/miragon-bpmn-modeler/tmp/scripting`,
        );
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
