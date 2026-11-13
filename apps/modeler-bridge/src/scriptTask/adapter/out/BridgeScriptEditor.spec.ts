import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    ArtifactService,
    InlineScript,
    SCRIPT_STREAM_DEBOUNCE_MS,
    ScriptFileStore,
    ScriptTabService,
    ScriptTargetResolver,
    ScriptUri,
    ScriptVariableStore,
} from "@miragon/bpmn-modeler-core";
import { createTestHost, FakeEditorHandle, TestHost } from "@miragon/bpmn-modeler-core/testing";
import {
    UpdateOpenScriptEditorsQuery,
    UpdateScriptContentQuery,
    UpdateScriptSourceCommand,
} from "@miragon/bpmn-modeler-shared";

import { BridgeScriptEditor } from "./BridgeScriptEditor";
import { METHODS } from "../../../protocol/domain/descriptor";

function scriptFilesOf(host: TestHost, osTempDir = "/tmp"): ScriptFileStore {
    return new ScriptFileStore(
        host.store,
        host.workspace,
        host.settings,
        new ArtifactService(host.workspace, host.settings),
        host.notifier,
        osTempDir,
        (path) => path,
    );
}

/** The core's script tabs over `editor`, as the bridge's composition wires them. */
function scriptTabsOver(
    host: TestHost,
    editor: BridgeScriptEditor,
    scriptFiles: ScriptFileStore,
): ScriptTabService {
    return new ScriptTabService(
        host.store,
        editor,
        new ScriptTargetResolver(host.store, host.picker, host.notifier),
        scriptFiles,
        host.notifier,
        { flushEditsOnEditorClose: true },
    );
}

/**
 * Focused unit coverage for the host-keystroke debounce wired into
 * {@link BridgeScriptEditor}. Fake timers drive the 300 ms coalescing window
 * deterministically; the integration harness in `bridge.script.spec.ts`
 * (real timers, polling) can't, so the debounce/flush/cancel edges are pinned
 * here instead.
 */
const EDITOR_PATH = "/repo/process.bpmn";
const EDITOR_ID = `file://${EDITOR_PATH}`;
const ELEMENT_ID = "Task_1";
const SCRIPT_URI = new ScriptUri(EDITOR_ID, ELEMENT_ID, "script-task", undefined, undefined, "js");
const SCRIPT_ID = SCRIPT_URI.toString();
const SCRIPT_FILE = `/repo/.camunda/tmp/scripting/${SCRIPT_URI.relativePath()}`;

interface Internals {
    filePathByScript: Map<string, string>;
}

/** A bridge editor with the script of {@link SCRIPT_ID} open, and nothing posted yet. */
async function createEditor() {
    const host = createTestHost({ folders: ["/repo"] });
    const modelerEditor = host.openEditor(EDITOR_PATH);
    const rpc = { notify: vi.fn(), request: vi.fn(), on: vi.fn() };

    const scriptFiles = scriptFilesOf(host);
    const editor = new BridgeScriptEditor(
        rpc as never,
        host.notifier,
        host.settings,
        scriptFiles,
        new ScriptVariableStore(),
    );
    const scriptTabs = scriptTabsOver(host, editor, scriptFiles);
    await scriptTabs.open(EDITOR_ID, openCommand("javascript", "a"));
    modelerEditor.posted.length = 0;

    return { editor, scriptTabs, host, modelerEditor, rpc };
}

/** UpdateScriptContentQuery posts only (skips lock broadcasts to the same webview). */
function contentPosts(modelerEditor: FakeEditorHandle): UpdateScriptContentQuery[] {
    return modelerEditor.postedOfType<UpdateScriptContentQuery>("UpdateScriptContentQuery");
}

function openCommand(format: string, content: string): InlineScript {
    return {
        elementId: "Task_1",
        kind: "script-task",
        listenerIndex: undefined,
        eventName: undefined,
        scriptFormat: format,
        content,
    };
}

function scriptOpenCall(rpc: { notify: { mock: { calls: unknown[][] } } }): unknown | undefined {
    return rpc.notify.mock.calls.find(([method]) => method === METHODS.scriptOpen)?.[1];
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("BridgeScriptEditor keystroke debounce", () => {
    it("coalesces a burst of didChange into one trailing post with the latest content", async () => {
        const { editor, modelerEditor } = await createEditor();

        editor.didChange(SCRIPT_ID, "a");
        editor.didChange(SCRIPT_ID, "ab");
        editor.didChange(SCRIPT_ID, "abc");
        // Nothing posts before the window elapses.
        expect(contentPosts(modelerEditor)).toHaveLength(0);

        await vi.advanceTimersByTimeAsync(SCRIPT_STREAM_DEBOUNCE_MS);

        expect(contentPosts(modelerEditor)).toEqual([
            new UpdateScriptContentQuery(ELEMENT_ID, "script-task", undefined, "abc"),
        ]);
    });

    it("does not post before the window elapses", async () => {
        const { editor, modelerEditor } = await createEditor();

        editor.didChange(SCRIPT_ID, "a");
        await vi.advanceTimersByTimeAsync(299);

        expect(contentPosts(modelerEditor)).toHaveLength(0);
    });

    it("ignores didChange for an unknown scriptId", async () => {
        const { editor, modelerEditor } = await createEditor();

        editor.didChange("nope", "x");
        await vi.advanceTimersByTimeAsync(SCRIPT_STREAM_DEBOUNCE_MS);

        expect(modelerEditor.posted).toEqual([]);
    });

    it("flushes the pending keystroke before releasing on didClose", async () => {
        const { editor, host, modelerEditor } = await createEditor();

        editor.didChange(SCRIPT_ID, "last");
        // Close arrives inside the debounce window; the flush must still deliver.
        await editor.didClose(SCRIPT_ID);

        expect(contentPosts(modelerEditor)).toEqual([
            new UpdateScriptContentQuery(ELEMENT_ID, "script-task", undefined, "last"),
        ]);
        // A user-initiated close must not delete the file (a re-open has to work);
        // it only drops the path entry so `open` rewrites fresh content.
        expect(host.workspace.files.has(SCRIPT_FILE)).toBe(true);
        expect((editor as unknown as Internals).filePathByScript.has(SCRIPT_ID)).toBe(false);
    });

    it("cancels a pending keystroke when the model overwrites the tab", async () => {
        const { editor, scriptTabs, modelerEditor, rpc } = await createEditor();

        editor.didChange(SCRIPT_ID, "stale");
        scriptTabs.applyModelChange(
            EDITOR_ID,
            new UpdateScriptSourceCommand(ELEMENT_ID, "script-task", undefined, "undone"),
        );
        await vi.advanceTimersByTimeAsync(SCRIPT_STREAM_DEBOUNCE_MS);

        // The stale keystroke never streamed back (it would clobber the undo).
        expect(contentPosts(modelerEditor)).toHaveLength(0);
        expect(rpc.notify).toHaveBeenCalledWith(METHODS.scriptUpdateContent, {
            scriptId: SCRIPT_ID,
            content: "undone",
        });
    });

    it("drops a pending keystroke when the script surface disappears", async () => {
        const { editor, scriptTabs, modelerEditor, rpc } = await createEditor();

        editor.didChange(SCRIPT_ID, "stale");
        scriptTabs.applyModelChange(
            EDITOR_ID,
            // `content` omitted: the element is gone.
            new UpdateScriptSourceCommand(ELEMENT_ID, "script-task", undefined, undefined),
        );
        await vi.advanceTimersByTimeAsync(SCRIPT_STREAM_DEBOUNCE_MS);

        expect(contentPosts(modelerEditor)).toHaveLength(0);
        expect(rpc.notify).toHaveBeenCalledWith(METHODS.scriptClose, { scriptId: SCRIPT_ID });
    });

});

/**
 * Unit coverage for the "Generate Script Files" materialise + adopt-on-open path.
 * These tests pin the branch decisions the integration harness
 * (`bridge.script.spec.ts`) can't isolate — skip-when-tracked, the four adoption
 * bail-outs, and the invariant that adoption never runs the orphan sweep.
 */
describe("BridgeScriptEditor materialise + adopt-on-open", () => {
    const FULL_EDITOR_PATH = "/repo/proc.bpmn";
    const FULL_EDITOR = `file://${FULL_EDITOR_PATH}`;
    const BASE_DIR = "/repo/.camunda/tmp/scripting";

    interface FullInternals {
        filePathByScript: Map<string, string>;
    }

    function createFullEditor(files: Record<string, string> = {}) {
        const host = createTestHost({
            folders: ["/repo"],
            files,
            settings: { scriptingSpin: false },
        });
        const modelerEditor = host.openEditor(FULL_EDITOR_PATH);
        const rpc = { notify: vi.fn(), request: vi.fn(), on: vi.fn() };

        const scriptFiles = scriptFilesOf(host);
        const editor = new BridgeScriptEditor(
            rpc as never,
            host.notifier,
            host.settings,
            scriptFiles,
            new ScriptVariableStore(),
        );
        const scriptTabs = scriptTabsOver(host, editor, scriptFiles);
        const internals = editor as unknown as FullInternals;
        return { editor, scriptTabs, host, modelerEditor, rpc, internals };
    }

    /** The on-disk path a script-task materialises to under the seeded base dir. */
    function scriptFilePath(elementId: string, extension: string): string {
        const uri = new ScriptUri(
            FULL_EDITOR,
            elementId,
            "script-task",
            undefined,
            undefined,
            extension,
        );
        return `${BASE_DIR}/${uri.relativePath()}`;
    }

    describe("materialize", () => {
        it("writes the file without a script/open or lock", async () => {
            const { scriptTabs, host, modelerEditor, rpc, internals } = createFullEditor();

            const result = await scriptTabs.materialize(FULL_EDITOR, openCommand("groovy", "x = 1"));

            expect(result).toEqual({ kind: "written" });
            expect(host.workspace.files.get(scriptFilePath("Task_1", "groovy"))).toBe("x = 1");
            // No tab semantics: no script/open, no lock broadcast, no path recorded
            // (an untracked panel-button open then rewrites from the model).
            expect(scriptOpenCall(rpc)).toBeUndefined();
            expect(modelerEditor.posted).toEqual([]);
            expect(internals.filePathByScript.size).toBe(0);
        });

        it("writes the .gitignore even when the orphan sweep fails", async () => {
            const { scriptTabs, host } = createFullEditor();
            vi.spyOn(host.workspace, "deleteDirectory").mockRejectedValueOnce(
                new Error("EBUSY: resource busy"),
            );

            await scriptTabs.materialize(FULL_EDITOR, openCommand("groovy", "x = 1"));

            expect(host.workspace.files.get("/repo/.camunda/tmp/.gitignore")).toBe("*\n");
            expect(host.notifier.logged("error")).toEqual([
                expect.stringContaining("EBUSY: resource busy"),
            ]);
        });
    });

    describe("adoptExternalOpen", () => {
        it("tracks the file, notifies script/open, broadcasts the lock, and never sweeps", async () => {
            const filePath = scriptFilePath("Task_1", "groovy");
            const { editor, scriptTabs, host, modelerEditor, rpc, internals } = createFullEditor({
                [filePath]: "disk content",
            });

            await editor.adoptExternalOpen(filePath);

            const scriptId = new ScriptUri(
                FULL_EDITOR,
                "Task_1",
                "script-task",
                undefined,
                undefined,
                "groovy",
            ).toString();
            expect(scriptTabs.editorOfTab(scriptId)).toBe(FULL_EDITOR);
            expect(internals.filePathByScript.get(scriptId)).toBe(filePath);
            expect(scriptOpenCall(rpc)).toMatchObject({
                scriptId,
                fileName: "Task_1.groovy",
                languageId: "groovy",
                filePath,
                content: "disk content",
            });
            expect(modelerEditor.postedOfType("UpdateOpenScriptEditorsQuery")).not.toEqual([]);
            // Adoption must not sweep the file being opened out from under it.
            expect(Object.fromEntries(host.workspace.files)).toEqual({
                [filePath]: "disk content",
            });
        });

        it("ignores an ambient sibling (camunda.d.ts)", async () => {
            const { editor, host, modelerEditor, rpc, internals } = createFullEditor();
            const readFile = vi.spyOn(host.workspace, "readFile");

            await editor.adoptExternalOpen(
                `${BASE_DIR}/${ScriptUri.hashEditorId(FULL_EDITOR)}/Task_1/script-task/camunda.d.ts`,
            );

            expect(scriptOpenCall(rpc)).toBeUndefined();
            expect(readFile).not.toHaveBeenCalled();
            expect(modelerEditor.posted).toEqual([]);
            expect(internals.filePathByScript.size).toBe(0);
        });

        it("ignores a path whose editor hash matches no live session", async () => {
            const { editor, modelerEditor, rpc, internals } = createFullEditor();

            await editor.adoptExternalOpen(`${BASE_DIR}/deadbeef/Task_1/script-task/Task_1.groovy`);

            expect(scriptOpenCall(rpc)).toBeUndefined();
            expect(modelerEditor.posted).toEqual([]);
            expect(internals.filePathByScript.size).toBe(0);
        });

        it("ignores a script path outside the editor's resolved base dir", async () => {
            const { editor, modelerEditor, rpc, internals } = createFullEditor();
            const hash = ScriptUri.hashEditorId(FULL_EDITOR);

            await editor.adoptExternalOpen(
                `/elsewhere/tmp/scripting/${hash}/Task_1/script-task/Task_1.groovy`,
            );

            expect(scriptOpenCall(rpc)).toBeUndefined();
            expect(modelerEditor.posted).toEqual([]);
            expect(internals.filePathByScript.size).toBe(0);
        });

        it("is a no-op for an already-tracked script", async () => {
            const { editor, scriptTabs, host, rpc } = createFullEditor();
            await scriptTabs.open(FULL_EDITOR, openCommand("groovy", "x = 1"));
            rpc.notify.mockClear();
            const readFile = vi.spyOn(host.workspace, "readFile");

            await editor.adoptExternalOpen(scriptFilePath("Task_1", "groovy"));

            expect(scriptOpenCall(rpc)).toBeUndefined();
            expect(readFile).not.toHaveBeenCalled();
        });

        it("marks the base dir swept so a later write path spares the adopted file", async () => {
            const adoptedPath = scriptFilePath("Task_1", "groovy");
            const { editor, scriptTabs, host } = createFullEditor({ [adoptedPath]: "disk content" });
            await editor.adoptExternalOpen(adoptedPath);

            // A later materialise of a *different* script must not sweep the dir
            // the adopted, live file sits in.
            await scriptTabs.materialize(FULL_EDITOR, {
                ...openCommand("groovy", "y = 2"),
                elementId: "Task_2",
            });

            expect(host.workspace.files.get(adoptedPath)).toBe("disk content");
            expect(host.workspace.files.get(scriptFilePath("Task_2", "groovy"))).toBe("y = 2");
        });
    });

    describe("re-open within the close window", () => {
        /** The last open-script lock broadcast, or undefined if none was posted. */
        function lastLockRefs(modelerEditor: FakeEditorHandle): unknown[] | undefined {
            const broadcasts = modelerEditor.postedOfType<UpdateOpenScriptEditorsQuery>(
                "UpdateOpenScriptEditorsQuery",
            );
            return broadcasts[broadcasts.length - 1]?.openScripts;
        }

        it("swallows the late didClose so the re-tracked script and its lock survive", async () => {
            const { editor, scriptTabs, host, modelerEditor, internals } = createFullEditor();
            const scriptId = new ScriptUri(
                FULL_EDITOR,
                "Task_1",
                "script-task",
                undefined,
                undefined,
                "groovy",
            ).toString();

            // 1. Open the script (tracks + writes + locks).
            await scriptTabs.open(FULL_EDITOR, openCommand("groovy", "v1"));
            expect(scriptTabs.editorOfTab(scriptId)).toBe(FULL_EDITOR);

            // 2. Element deletion requests a close — the file deletion is deferred
            //    to the host's didClose ack.
            scriptTabs.applyModelChange(
                FULL_EDITOR,
                new UpdateScriptSourceCommand("Task_1", "script-task", undefined, undefined),
            );
            expect(scriptTabs.editorOfTab(scriptId)).toBeUndefined();

            // 3. The script re-opens inside that window: the pending ack is
            //    cancelled and the next didClose is armed to be swallowed.
            await scriptTabs.open(FULL_EDITOR, openCommand("groovy", "v2"));
            expect(scriptTabs.editorOfTab(scriptId)).toBe(FULL_EDITOR);
            const filesBeforeLateClose = new Map(host.workspace.files);

            // 4. The host still emits one late didClose for the pre-empted close.
            await editor.didClose(scriptId);

            // The re-tracked entry, its file path, and the lock all survive; no
            // deferred deletion ran.
            expect(scriptTabs.editorOfTab(scriptId)).toBe(FULL_EDITOR);
            expect(internals.filePathByScript.has(scriptId)).toBe(true);
            expect(host.workspace.files).toEqual(filesBeforeLateClose);
            expect(lastLockRefs(modelerEditor)).toHaveLength(1);
        });
    });
});

describe("BridgeScriptEditor base directory", () => {
    function createEditorWhoseLookupFails() {
        const host = createTestHost({ folders: ["/repo"] });
        host.openEditor("/repo/process.bpmn");
        vi.spyOn(host.workspace, "getWorkspaceFolderForDocument").mockImplementation(() => {
            throw new Error("workspace lookup failed");
        });
        const rpc = { notify: vi.fn(), request: vi.fn(), on: vi.fn() };
        const scriptFiles = scriptFilesOf(host);
        const editor = new BridgeScriptEditor(
            rpc as never,
            host.notifier,
            host.settings,
            scriptFiles,
            new ScriptVariableStore(),
        );
        return { editor, scriptTabs: scriptTabsOver(host, editor, scriptFiles), host, rpc };
    }

    it("fails the write when a file diagram's workspace lookup fails, instead of using the OS temp folder", async () => {
        const { scriptTabs, host } = createEditorWhoseLookupFails();

        await expect(
            scriptTabs.materialize("file:///repo/process.bpmn", openCommand("groovy", "x = 1")),
        ).rejects.toThrow("workspace lookup failed");
        expect(host.workspace.files.size).toBe(0);
    });

    it("opens the script without a file and logs why when the workspace lookup fails", async () => {
        const { scriptTabs, host, rpc } = createEditorWhoseLookupFails();

        await scriptTabs.open("file:///repo/process.bpmn", openCommand("groovy", "x = 1"));

        expect(scriptOpenCall(rpc)).toMatchObject({ filePath: undefined, content: "x = 1" });
        expect(host.workspace.files.size).toBe(0);
        expect(host.notifier.logged("error")).toEqual([
            expect.stringContaining("workspace lookup failed"),
        ]);
    });
});

/**
 * IntelliJ sends a project on a network share as `//server/share/repo`. On
 * Windows `/server/share/…` names a folder on the current drive, so every path
 * the editor writes, deletes or hands to IntelliJ must keep the leading `//`.
 */
describe("BridgeScriptEditor keeps the UNC root of script files in a workspace on a share", () => {
    const SHARE_ROOT = "//server/share/repo";
    const SHARE_EDITOR_PATH = `${SHARE_ROOT}/process.bpmn`;
    const SHARE_EDITOR = `file://${SHARE_EDITOR_PATH}`;
    const SHARE_BASE_DIR = `${SHARE_ROOT}/.camunda/tmp/scripting`;
    const SHARE_GITIGNORE = `${SHARE_ROOT}/.camunda/tmp/.gitignore`;

    beforeEach(() => {
        vi.stubGlobal("process", { ...process, platform: "win32" });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function createShareEditor(files: Record<string, string> = {}, osTempDir?: string) {
        const host = createTestHost({
            folders: [SHARE_ROOT],
            files,
            settings: { scriptingSpin: false },
        });
        host.openEditor(SHARE_EDITOR_PATH);
        const rpc = { notify: vi.fn(), request: vi.fn(), on: vi.fn() };
        const scriptFiles = scriptFilesOf(host, osTempDir);
        const editor = new BridgeScriptEditor(
            rpc as never,
            host.notifier,
            host.settings,
            scriptFiles,
            new ScriptVariableStore(),
        );
        return { editor, scriptTabs: scriptTabsOver(host, editor, scriptFiles), host, rpc };
    }

    const taskScript = (editorId: string) =>
        new ScriptUri(editorId, "Task_1", "script-task", undefined, undefined, "groovy");
    const shareScriptFile = `${SHARE_BASE_DIR}/${taskScript(SHARE_EDITOR).relativePath()}`;

    it("writes an opened script and its .gitignore onto the share and sends IntelliJ that path", async () => {
        const { scriptTabs, host, rpc } = createShareEditor();

        await scriptTabs.open(SHARE_EDITOR, openCommand("groovy", "x = 1"));

        expect(Object.fromEntries(host.workspace.files)).toEqual({
            [SHARE_GITIGNORE]: "*\n",
            [shareScriptFile]: "x = 1",
        });
        expect(scriptOpenCall(rpc)).toMatchObject({ filePath: shareScriptFile });
    });

    it("writes a generated script file onto the share", async () => {
        const { scriptTabs, host } = createShareEditor();

        await scriptTabs.materialize(SHARE_EDITOR, openCommand("groovy", "x = 1"));

        expect(Object.fromEntries(host.workspace.files)).toEqual({
            [SHARE_GITIGNORE]: "*\n",
            [shareScriptFile]: "x = 1",
        });
    });

    it.each([
        { spelling: "//server/share/…", reported: shareScriptFile },
        { spelling: "\\\\server\\share\\…", reported: shareScriptFile.replace(/\//g, "\\") },
    ])("adopts a script file IntelliJ reports as $spelling", async ({ reported }) => {
        const { editor, rpc } = createShareEditor({ [shareScriptFile]: "disk content" });

        await editor.adoptExternalOpen(reported);

        expect(scriptOpenCall(rpc)).toMatchObject({
            scriptId: taskScript(SHARE_EDITOR).toString(),
            filePath: shareScriptFile,
            content: "disk content",
        });
    });

    it("sweeps the script folders on the share, not on the current drive", async () => {
        const { scriptTabs, host } = createShareEditor();
        // The in-memory workspace matches directories with `posix.relative`,
        // which reads `/server/…` and `//server/…` as one, so the swept
        // directories are read off the port.
        const deleteDirectory = vi.spyOn(host.workspace, "deleteDirectory");

        await scriptTabs.materialize(SHARE_EDITOR, openCommand("groovy", "x = 1"));
        scriptTabs.disposeEditor(SHARE_EDITOR);

        expect(deleteDirectory.mock.calls).toEqual([
            [SHARE_BASE_DIR],
            [`${SHARE_BASE_DIR}/${ScriptUri.hashEditorId(SHARE_EDITOR)}`],
        ]);
    });

    it("keeps the UNC root of an OS temp folder on a share for a document without a file path", async () => {
        const { scriptTabs, host } = createShareEditor({}, "\\\\server\\profiles\\peter\\Temp");
        const untitled = new FakeEditorHandle("Untitled-1", { scheme: "untitled" });
        host.store.register(untitled);
        const tempScripting = "//server/profiles/peter/Temp/miragon-bpmn-modeler/tmp";

        await scriptTabs.materialize(untitled.id, openCommand("groovy", "x = 1"));

        expect(Object.fromEntries(host.workspace.files)).toEqual({
            [`${tempScripting}/.gitignore`]: "*\n",
            [`${tempScripting}/scripting/${taskScript(untitled.id).relativePath()}`]: "x = 1",
        });
    });
});
