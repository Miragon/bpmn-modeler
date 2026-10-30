import { describe, expect, it, vi } from "vitest";

import { ArtifactService } from "../../kernel/service/ArtifactService";
import { createTestHost } from "../../testing/createTestHost";
import { FakeEditorHandle } from "../../testing/FakeEditorHandle";
import { ScriptUri } from "../domain/ScriptUri";
import { ScriptFileStore } from "./ScriptFileStore";

const OS_TEMP = "/tmp/os";
const BASE_DIR = "/ws/.camunda/tmp/scripting";
const GITIGNORE = "/ws/.camunda/tmp/.gitignore";

function createStore({
    folders = ["/ws"],
    files = {},
}: { folders?: string[]; files?: Record<string, string> } = {}) {
    const host = createTestHost({ folders, files });
    const diagram = host.openEditor("/ws/process.bpmn");
    const store = new ScriptFileStore(
        host.store,
        host.workspace,
        host.settings,
        new ArtifactService(host.workspace, host.settings),
        host.notifier,
        OS_TEMP,
        (path) => `<host spelling of ${path}>`,
    );
    return { host, store, diagram };
}

const flushPendingWork = () => new Promise((resolve) => setTimeout(resolve, 0));

function groovyScript(editorId: string, elementId = "Task_1"): ScriptUri {
    return new ScriptUri(editorId, elementId, "script-task", undefined, undefined, "groovy");
}

function scriptPath(editorId: string, elementId = "Task_1", baseDir = BASE_DIR): string {
    return `${baseDir}/${groovyScript(editorId, elementId).relativePath()}`;
}

describe("ScriptFileStore.baseDirFor", () => {
    it("resolves below the config folder of the diagram's workspace folder", async () => {
        const { store, diagram } = createStore();

        expect(await store.baseDirFor(diagram.id)).toBe(BASE_DIR);
    });

    it("resolves below the config folder of the document's folder outside every workspace folder", async () => {
        const { host, store } = createStore({ folders: [] });
        const loose = host.openEditor("/loose/process.bpmn");

        expect(await store.baseDirFor(loose.id)).toBe("/loose/.camunda/tmp/scripting");
    });

    it("keeps the UNC root of a workspace on a share", async () => {
        const { host, store } = createStore({ folders: ["//server/share/repo"] });
        const shared = host.openEditor("//server/share/repo/process.bpmn");

        expect(await store.baseDirFor(shared.id)).toBe(
            "//server/share/repo/.camunda/tmp/scripting",
        );
    });

    it("keeps the scripts of a diagram without a file path in the OS temp folder", async () => {
        const { host, store } = createStore();
        const untitled = new FakeEditorHandle("Untitled-1", { scheme: "untitled" });
        host.store.register(untitled);

        expect(await store.baseDirFor(untitled.id)).toBe(
            `${OS_TEMP}/miragon-bpmn-modeler/tmp/scripting`,
        );
    });

    it("rejects a failed workspace lookup instead of using the OS temp folder", async () => {
        const { host, store, diagram } = createStore();
        vi.spyOn(host.workspace, "getWorkspaceFolderForDocument").mockImplementationOnce(() => {
            throw new Error("workspace lookup failed");
        });

        await expect(store.baseDirFor(diagram.id)).rejects.toThrow("workspace lookup failed");
        expect(store.hasBaseDir(diagram.id)).toBe(false);
        expect(await store.baseDirFor(diagram.id)).toBe(BASE_DIR);
    });

    it("keeps the first base dir when the config folder changes later", async () => {
        const { host, store, diagram } = createStore();
        await store.baseDirFor(diagram.id);

        host.settings.values.configFolder = ".bpmn";

        expect(await store.baseDirFor(diagram.id)).toBe(BASE_DIR);
        expect(store.hasBaseDir(diagram.id)).toBe(true);
    });
});

describe("ScriptFileStore.displayNameFor", () => {
    it("names the folder below the workspace root once the base dir was resolved", async () => {
        const { store, diagram } = createStore();
        expect(store.displayNameFor(diagram.id)).toBeUndefined();

        await store.baseDirFor(diagram.id);

        expect(store.displayNameFor(diagram.id)).toBe(".camunda/tmp/scripting");
    });

    it("names the whole OS temp folder in the host's spelling for a diagram without a file path", async () => {
        const { host, store } = createStore();
        const untitled = new FakeEditorHandle("Untitled-1", { scheme: "untitled" });
        host.store.register(untitled);

        await store.baseDirFor(untitled.id);

        expect(store.displayNameFor(untitled.id)).toBe(
            `<host spelling of ${OS_TEMP}/miragon-bpmn-modeler/tmp/scripting>`,
        );
    });

    it("names nothing after the editor was released", async () => {
        const { store, diagram } = createStore();
        await store.baseDirFor(diagram.id);

        store.releaseEditor(diagram.id);

        expect(store.displayNameFor(diagram.id)).toBeUndefined();
    });
});

describe("ScriptFileStore.prepareScriptFile", () => {
    it("sweeps orphans from the base dir on first use, then writes a catch-all .gitignore", async () => {
        const orphan = `${BASE_DIR}/deadbeef/Task_9/script-task/Task_9.groovy`;
        const { host, store, diagram } = createStore({ files: { [orphan]: "left behind" } });

        expect(await store.prepareScriptFile(diagram.id, groovyScript(diagram.id))).toBe(
            scriptPath(diagram.id),
        );

        expect(Object.fromEntries(host.workspace.files)).toEqual({ [GITIGNORE]: "*\n" });
    });

    it("sweeps each base dir only once per process", async () => {
        const { host, store, diagram } = createStore();
        await store.prepareScriptFile(diagram.id, groovyScript(diagram.id));
        await host.workspace.writeFile(scriptPath(diagram.id), "live");

        await store.prepareScriptFile(diagram.id, groovyScript(diagram.id));

        expect(host.workspace.files.get(scriptPath(diagram.id))).toBe("live");
    });

    it("keeps a user-edited .gitignore", async () => {
        const { host, store, diagram } = createStore({ files: { [GITIGNORE]: "*\n!keep\n" } });

        await store.prepareScriptFile(diagram.id, groovyScript(diagram.id));

        expect(host.workspace.files.get(GITIGNORE)).toBe("*\n!keep\n");
    });

    it("writes a .gitignore deleted after the first write", async () => {
        const { host, store, diagram } = createStore();
        await store.prepareScriptFile(diagram.id, groovyScript(diagram.id));
        host.workspace.deleteFile(GITIGNORE);

        await store.prepareScriptFile(diagram.id, groovyScript(diagram.id));

        expect(host.workspace.files.get(GITIGNORE)).toBe("*\n");
    });

    it("writes the .gitignore and logs the failure when the sweep fails", async () => {
        const { host, store, diagram } = createStore();
        vi.spyOn(host.workspace, "deleteDirectory").mockRejectedValueOnce(new Error("EBUSY"));

        await store.prepareScriptFile(diagram.id, groovyScript(diagram.id));

        expect(host.workspace.files.get(GITIGNORE)).toBe("*\n");
        expect(host.notifier.logged("error")).toEqual([
            expect.stringMatching(
                new RegExp(`^Could not sweep the script folder ${BASE_DIR}: Error: EBUSY`),
            ),
        ]);
    });

    it("does not retry a failed sweep, which would delete live scripts", async () => {
        const { host, store, diagram } = createStore();
        vi.spyOn(host.workspace, "deleteDirectory").mockRejectedValueOnce(new Error("EBUSY"));
        await store.prepareScriptFile(diagram.id, groovyScript(diagram.id));
        await host.workspace.writeFile(scriptPath(diagram.id), "live");

        await store.prepareScriptFile(diagram.id, groovyScript(diagram.id));

        expect(host.workspace.files.get(scriptPath(diagram.id))).toBe("live");
    });

    it("keeps a write that waits for the first sweep out of that sweep", async () => {
        const { host, store, diagram } = createStore();
        const sharingDiagram = host.openEditor("/ws/other.bpmn");
        const sharedScriptPath = scriptPath(sharingDiagram.id);
        const deleteDirectory = host.workspace.deleteDirectory.bind(host.workspace);
        let finishSweep!: () => void;
        const sweepHangs = new Promise<void>((resolve) => (finishSweep = resolve));
        vi.spyOn(host.workspace, "deleteDirectory").mockImplementationOnce(async (path) => {
            await sweepHangs;
            await deleteDirectory(path);
        });

        const firstWrite = store.prepareScriptFile(diagram.id, groovyScript(diagram.id));
        const sharedWrite = store
            .prepareScriptFile(sharingDiagram.id, groovyScript(sharingDiagram.id))
            .then((path) => host.workspace.writeFile(path, "live"));
        await flushPendingWork();
        expect(host.workspace.files.has(sharedScriptPath)).toBe(false);

        finishSweep();
        await Promise.all([firstWrite, sharedWrite]);

        expect(host.workspace.files.get(sharedScriptPath)).toBe("live");
    });

    it("logs a failed .gitignore write and still returns the script's path", async () => {
        const { host, store, diagram } = createStore();
        vi.spyOn(host.workspace, "writeFile").mockRejectedValueOnce(new Error("EACCES"));

        expect(await store.prepareScriptFile(diagram.id, groovyScript(diagram.id))).toBe(
            scriptPath(diagram.id),
        );

        expect(host.notifier.logged("error")).toEqual([
            expect.stringMatching(new RegExp(`^Could not write ${GITIGNORE}: Error: EACCES`)),
        ]);
    });

    it("leaves an unreadable .gitignore alone and logs why", async () => {
        const { host, store, diagram } = createStore({ files: { [GITIGNORE]: "*\n!keep\n" } });
        vi.spyOn(host.workspace, "readFile").mockRejectedValueOnce(new Error("EACCES"));

        await store.prepareScriptFile(diagram.id, groovyScript(diagram.id));

        expect(host.workspace.files.get(GITIGNORE)).toBe("*\n!keep\n");
        expect(host.notifier.logged("error")).toEqual([
            expect.stringMatching(new RegExp(`^Could not read ${GITIGNORE}: Error: EACCES`)),
        ]);
    });

    it("rejects without touching the disk when the base dir lookup fails", async () => {
        const { host, store, diagram } = createStore();
        vi.spyOn(host.workspace, "getWorkspaceFolderForDocument").mockImplementationOnce(() => {
            throw new Error("workspace lookup failed");
        });

        await expect(store.prepareScriptFile(diagram.id, groovyScript(diagram.id))).rejects.toThrow(
            "workspace lookup failed",
        );
        expect(host.workspace.files.size).toBe(0);
    });
});

describe("ScriptFileStore.adopt", () => {
    it.each([
        {
            place: "inside the editor's base dir",
            path: scriptPath("file:///ws/process.bpmn"),
            adopted: true,
        },
        {
            place: "in another tmp/scripting folder",
            path: scriptPath("file:///ws/process.bpmn", "Task_1", "/elsewhere/tmp/scripting"),
            adopted: false,
        },
        {
            place: "in a sibling folder sharing the base dir's prefix",
            path: scriptPath("file:///ws/process.bpmn", "Task_1", `${BASE_DIR}2`),
            adopted: false,
        },
    ])("adopts a script file $place: $adopted", async ({ path, adopted }) => {
        const { store, diagram } = createStore();

        expect(await store.adopt(diagram.id, path)).toBe(adopted);
    });

    it("spares an adopted file from the first write's sweep", async () => {
        const adoptedPath = scriptPath("file:///ws/process.bpmn");
        const { host, store, diagram } = createStore({ files: { [adoptedPath]: "live" } });
        await store.adopt(diagram.id, adoptedPath);

        await store.prepareScriptFile(diagram.id, groovyScript(diagram.id));

        expect(host.workspace.files.get(adoptedPath)).toBe("live");
    });

    it("still sweeps on the first write after a file outside the base dir was offered", async () => {
        const orphan = scriptPath("file:///ws/process.bpmn");
        const { host, store, diagram } = createStore({ files: { [orphan]: "left behind" } });
        await store.adopt(
            diagram.id,
            "/elsewhere/tmp/scripting/x/Task_1/script-task/Task_1.groovy",
        );

        await store.prepareScriptFile(diagram.id, groovyScript(diagram.id));

        expect(host.workspace.files.has(orphan)).toBe(false);
    });
});

describe("ScriptFileStore.releaseEditor", () => {
    it("returns the folder of all the editor's scripts and forgets its base dir", async () => {
        const { store, diagram } = createStore();
        await store.baseDirFor(diagram.id);

        expect(store.releaseEditor(diagram.id)).toBe(
            `${BASE_DIR}/${ScriptUri.hashEditorId(diagram.id)}`,
        );
        expect(store.hasBaseDir(diagram.id)).toBe(false);
        expect(store.releaseEditor(diagram.id)).toBeUndefined();
    });

    it("returns nothing for an editor that never had a base dir", () => {
        const { store, diagram } = createStore();

        expect(store.releaseEditor(diagram.id)).toBeUndefined();
    });
});

describe("ScriptFileStore deletion", () => {
    it("deletes a script with the ambient files next to it and nothing else", async () => {
        const editorId = "file:///ws/process.bpmn";
        const script = scriptPath(editorId);
        const ambient = `${script.slice(0, script.lastIndexOf("/"))}/camunda.d.ts`;
        const sibling = scriptPath(editorId, "Task_2");
        const { host, store } = createStore({
            files: { [script]: "x", [ambient]: "declare", [sibling]: "y" },
        });

        await store.deleteScript(script);

        expect(Object.fromEntries(host.workspace.files)).toEqual({ [sibling]: "y" });
    });

    it("logs a failed delete instead of rejecting", async () => {
        const { host, store } = createStore();
        vi.spyOn(host.workspace, "deleteDirectory").mockRejectedValueOnce(new Error("EBUSY"));

        await expect(store.deleteFolder(`${BASE_DIR}/abc`)).resolves.toBeUndefined();

        expect(host.notifier.logged("error")).toEqual([
            expect.stringMatching(
                new RegExp(`^Could not delete the script folder ${BASE_DIR}/abc: Error: EBUSY`),
            ),
        ]);
    });

    it("reads and writes script files through the workspace", async () => {
        const { host, store } = createStore();

        await store.writeFile(scriptPath("file:///ws/process.bpmn"), "x = 1");

        expect(await store.readFile(scriptPath("file:///ws/process.bpmn"))).toBe("x = 1");
        expect(host.workspace.files.get(scriptPath("file:///ws/process.bpmn"))).toBe("x = 1");
    });
});
