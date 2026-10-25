import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScriptUri } from "@miragon/bpmn-modeler-core";
import { createTestHost, FakeEditorHandle } from "@miragon/bpmn-modeler-core/testing";
import {
    OpenScriptEditorCommand,
    UpdateOpenScriptEditorsQuery,
    UpdateScriptContentQuery,
    UpdateScriptSourceCommand,
} from "@miragon/bpmn-modeler-shared";

import { BridgeScriptEditor } from "./scriptAdapters";
import { METHODS } from "./protocol/descriptor";

/**
 * Focused unit coverage for the host-keystroke debounce wired into
 * {@link BridgeScriptEditor}. Fake timers drive the 300 ms coalescing window
 * deterministically; the integration harness in `bridge.script.spec.ts`
 * (real timers, polling) can't, so the debounce/flush/cancel edges are pinned
 * here instead. The tracked-script state is seeded directly rather than through
 * the full `open` flow, which is exercised end-to-end elsewhere.
 */
const EDITOR_PATH = "/repo/process.bpmn";
const EDITOR_ID = `file://${EDITOR_PATH}`;
const SCRIPT_ID = "script-1";
const ELEMENT_ID = "Task_1";
const SCRIPT_FILE = "/base/hash/Task_1/slug/Task_1.js";

interface Internals {
    scripts: Map<string, unknown>;
    filePathByScript: Map<string, string>;
}

function createEditor() {
    const host = createTestHost({ files: { [SCRIPT_FILE]: "a" } });
    const modelerEditor = host.openEditor(EDITOR_PATH);
    const rpc = { notify: vi.fn(), request: vi.fn(), on: vi.fn() };
    const manifestSvc = {};
    const artifactSvc = {};

    const editor = new BridgeScriptEditor(
        host.store,
        host.picker,
        rpc as never,
        host.notifier,
        host.settings,
        manifestSvc as never,
        host.workspace,
        artifactSvc as never,
    );

    // Seed a tracked script so didChange/applyModelChange/dispose resolve it.
    const internals = editor as unknown as Internals;
    internals.scripts.set(SCRIPT_ID, {
        editorId: EDITOR_ID,
        elementId: ELEMENT_ID,
        kind: "script-task",
        listenerIndex: undefined,
    });
    internals.filePathByScript.set(SCRIPT_ID, SCRIPT_FILE);

    return { editor, host, modelerEditor, rpc };
}

/** UpdateScriptContentQuery posts only (skips lock broadcasts to the same webview). */
function contentPosts(modelerEditor: FakeEditorHandle): UpdateScriptContentQuery[] {
    return modelerEditor.postedOfType<UpdateScriptContentQuery>("UpdateScriptContentQuery");
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("BridgeScriptEditor keystroke debounce", () => {
    it("coalesces a burst of didChange into one trailing post with the latest content", async () => {
        const { editor, modelerEditor } = createEditor();

        editor.didChange(SCRIPT_ID, "a");
        editor.didChange(SCRIPT_ID, "ab");
        editor.didChange(SCRIPT_ID, "abc");
        // Nothing posts before the window elapses.
        expect(contentPosts(modelerEditor)).toHaveLength(0);

        await vi.advanceTimersByTimeAsync(300);

        expect(contentPosts(modelerEditor)).toEqual([
            new UpdateScriptContentQuery(ELEMENT_ID, "script-task", undefined, "abc"),
        ]);
    });

    it("does not post before the window elapses", async () => {
        const { editor, modelerEditor } = createEditor();

        editor.didChange(SCRIPT_ID, "a");
        await vi.advanceTimersByTimeAsync(299);

        expect(contentPosts(modelerEditor)).toHaveLength(0);
    });

    it("ignores didChange for an unknown scriptId", async () => {
        const { editor, modelerEditor } = createEditor();

        editor.didChange("nope", "x");
        await vi.advanceTimersByTimeAsync(300);

        expect(modelerEditor.posted).toEqual([]);
    });

    it("flushes the pending keystroke before releasing on didClose", async () => {
        const { editor, host, modelerEditor } = createEditor();

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
        const { editor, modelerEditor, rpc } = createEditor();

        editor.didChange(SCRIPT_ID, "stale");
        editor.applyModelChange(
            new UpdateScriptSourceCommand(ELEMENT_ID, "script-task", undefined, "undone"),
            EDITOR_ID,
        );
        await vi.advanceTimersByTimeAsync(300);

        // The stale keystroke never streamed back (it would clobber the undo).
        expect(contentPosts(modelerEditor)).toHaveLength(0);
        expect(rpc.notify).toHaveBeenCalledWith(METHODS.scriptUpdateContent, {
            scriptId: SCRIPT_ID,
            content: "undone",
        });
    });

    it("drops a pending keystroke when the script surface disappears", async () => {
        const { editor, modelerEditor, rpc } = createEditor();

        editor.didChange(SCRIPT_ID, "stale");
        editor.applyModelChange(
            // `content` omitted: the element is gone.
            new UpdateScriptSourceCommand(ELEMENT_ID, "script-task", undefined, undefined),
            EDITOR_ID,
        );
        await vi.advanceTimersByTimeAsync(300);

        expect(contentPosts(modelerEditor)).toHaveLength(0);
        expect(rpc.notify).toHaveBeenCalledWith(METHODS.scriptClose, { scriptId: SCRIPT_ID });
    });

    it("best-effort flushes the pending keystroke on editor dispose", async () => {
        const { editor, modelerEditor, rpc } = createEditor();

        editor.didChange(SCRIPT_ID, "final");
        editor.disposeEditor(EDITOR_ID);
        // Let the flush's in-flight post settle.
        await vi.advanceTimersByTimeAsync(0);

        expect(contentPosts(modelerEditor)).toEqual([
            new UpdateScriptContentQuery(ELEMENT_ID, "script-task", undefined, "final"),
        ]);
        expect(rpc.notify).toHaveBeenCalledWith(METHODS.scriptClose, { scriptId: SCRIPT_ID });
    });
});

/**
 * Unit coverage for the "Generate Script Files" materialise + adopt-on-open path.
 * `baseDirByEditor` is seeded directly so resolution is deterministic without the
 * workspace-root/config-folder plumbing (exercised end-to-end in
 * `bridge.script.spec.ts`); these tests pin the branch decisions the integration
 * harness can't isolate — skip-when-tracked, the four adoption bail-outs, and the
 * invariant that adoption never runs the orphan sweep.
 */
describe("BridgeScriptEditor materialise + adopt-on-open", () => {
    const FULL_EDITOR_PATH = "/repo/proc.bpmn";
    const FULL_EDITOR = `file://${FULL_EDITOR_PATH}`;
    const BASE_DIR = "/repo/.camunda/tmp/scripting";

    interface FullInternals {
        baseDirByEditor: Map<string, string>;
        scripts: Map<string, unknown>;
        filePathByScript: Map<string, string>;
        extractedByEditor: Map<string, unknown[]>;
    }

    function createFullEditor(files: Record<string, string> = {}) {
        const host = createTestHost({ files, settings: { scriptingSpin: false } });
        const modelerEditor = host.openEditor(FULL_EDITOR_PATH);
        const rpc = { notify: vi.fn(), request: vi.fn(), on: vi.fn() };

        const editor = new BridgeScriptEditor(
            host.store,
            host.picker,
            rpc as never,
            host.notifier,
            host.settings,
            {} as never,
            host.workspace,
            {} as never,
        );
        const internals = editor as unknown as FullInternals;
        // Skip the workspace-root resolution; the sweep still exercises deleteDirectory.
        internals.baseDirByEditor.set(FULL_EDITOR, BASE_DIR);
        return { editor, host, modelerEditor, rpc, internals };
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

    function openCommand(format: string, content: string, variables: unknown[] = []) {
        return new OpenScriptEditorCommand(
            "Task_1",
            "script-task",
            undefined,
            undefined,
            format,
            content,
            variables as never,
        );
    }

    function scriptOpenCall(rpc: {
        notify: { mock: { calls: unknown[][] } };
    }): unknown | undefined {
        return rpc.notify.mock.calls.find(([method]) => method === METHODS.scriptOpen)?.[1];
    }

    describe("materialize", () => {
        it("writes the file and seeds variables without a script/open or lock", async () => {
            const { editor, host, rpc, modelerEditor, internals } = createFullEditor();
            const variables = [{ name: "amount", origin: "form field", confidence: "declared" }];

            const result = await editor.materialize(
                openCommand("groovy", "x = 1", variables),
                FULL_EDITOR,
            );

            expect(result).toEqual({ written: true });
            expect(host.workspace.files.get(scriptFilePath("Task_1", "groovy"))).toBe("x = 1");
            expect(internals.extractedByEditor.get(FULL_EDITOR)).toEqual(variables);
            // No tab semantics: no script/open, no lock broadcast, no path recorded
            // (an untracked panel-button open then rewrites from the model).
            expect(scriptOpenCall(rpc)).toBeUndefined();
            expect(modelerEditor.posted).toEqual([]);
            expect(internals.scripts.size).toBe(0);
            expect(internals.filePathByScript.size).toBe(0);
        });

        it("skips a script an open tab already owns, leaving its buffer untouched", async () => {
            const { editor, host, internals } = createFullEditor();
            const scriptId = new ScriptUri(
                FULL_EDITOR,
                "Task_1",
                "script-task",
                undefined,
                undefined,
                "groovy",
            ).toString();
            internals.scripts.set(scriptId, {
                editorId: FULL_EDITOR,
                elementId: "Task_1",
                kind: "script-task",
                listenerIndex: undefined,
            });

            const result = await editor.materialize(openCommand("groovy", "fresh"), FULL_EDITOR);

            expect(result).toEqual({ written: false });
            expect(host.workspace.files.size).toBe(0);
        });

        it("returns undefined when the language picker is cancelled", async () => {
            const { editor, host } = createFullEditor();

            const result = await editor.materialize(openCommand("", ""), FULL_EDITOR);

            expect(result).toBeUndefined();
            expect(host.picker.prompts).toEqual([{ method: "pickScriptLanguage", args: [""] }]);
            expect(host.workspace.files.size).toBe(0);
        });
    });

    describe("adoptExternalOpen", () => {
        it("tracks the file, notifies script/open, broadcasts the lock, and never sweeps", async () => {
            const filePath = scriptFilePath("Task_1", "groovy");
            const { editor, rpc, modelerEditor, host, internals } = createFullEditor({
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
            expect(internals.scripts.has(scriptId)).toBe(true);
            expect(internals.filePathByScript.get(scriptId)).toBe(filePath);
            expect(scriptOpenCall(rpc)).toMatchObject({
                scriptId,
                fileName: "Task_1.groovy",
                languageId: "groovy",
                filePath,
                content: "disk content",
            });
            expect(modelerEditor.postedOfType("UpdateOpenScriptEditorsQuery")).not.toEqual([]);
            // The whole point of resolveBaseDir (not prepareBaseDir): the file being
            // opened must not be swept out from under the adoption.
            expect(Object.fromEntries(host.workspace.files)).toEqual({
                [filePath]: "disk content",
            });
        });

        it("ignores an ambient sibling (camunda.d.ts)", async () => {
            const { editor, rpc, host, internals } = createFullEditor();
            const readFile = vi.spyOn(host.workspace, "readFile");

            await editor.adoptExternalOpen(
                `${BASE_DIR}/${ScriptUri.hashEditorId(FULL_EDITOR)}/Task_1/script-task/camunda.d.ts`,
            );

            expect(scriptOpenCall(rpc)).toBeUndefined();
            expect(readFile).not.toHaveBeenCalled();
            expect(internals.scripts.size).toBe(0);
        });

        it("ignores a path whose editor hash matches no live session", async () => {
            const { editor, rpc, internals } = createFullEditor();

            await editor.adoptExternalOpen(`${BASE_DIR}/deadbeef/Task_1/script-task/Task_1.groovy`);

            expect(scriptOpenCall(rpc)).toBeUndefined();
            expect(internals.scripts.size).toBe(0);
        });

        it("ignores a script path outside the editor's resolved base dir", async () => {
            const { editor, rpc, internals } = createFullEditor();
            const hash = ScriptUri.hashEditorId(FULL_EDITOR);

            await editor.adoptExternalOpen(
                `/elsewhere/tmp/scripting/${hash}/Task_1/script-task/Task_1.groovy`,
            );

            expect(scriptOpenCall(rpc)).toBeUndefined();
            expect(internals.scripts.size).toBe(0);
        });

        it("is a no-op for an already-tracked script", async () => {
            const { editor, rpc, host, internals } = createFullEditor();
            const readFile = vi.spyOn(host.workspace, "readFile");
            const scriptId = new ScriptUri(
                FULL_EDITOR,
                "Task_1",
                "script-task",
                undefined,
                undefined,
                "groovy",
            ).toString();
            internals.scripts.set(scriptId, {
                editorId: FULL_EDITOR,
                elementId: "Task_1",
                kind: "script-task",
                listenerIndex: undefined,
            });

            await editor.adoptExternalOpen(scriptFilePath("Task_1", "groovy"));

            expect(scriptOpenCall(rpc)).toBeUndefined();
            expect(readFile).not.toHaveBeenCalled();
        });

        it("marks the base dir swept so a later write path spares the adopted file", async () => {
            const adoptedPath = scriptFilePath("Task_1", "groovy");
            const { editor, host } = createFullEditor({ [adoptedPath]: "disk content" });
            await editor.adoptExternalOpen(adoptedPath);

            // A later materialise of a *different* script must not sweep the dir
            // the adopted, live file sits in.
            const cmd = new OpenScriptEditorCommand(
                "Task_2",
                "script-task",
                undefined,
                undefined,
                "groovy",
                "y = 2",
                [] as never,
            );
            await editor.materialize(cmd, FULL_EDITOR);

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
            const { editor, modelerEditor, internals, host } = createFullEditor();
            const scriptId = new ScriptUri(
                FULL_EDITOR,
                "Task_1",
                "script-task",
                undefined,
                undefined,
                "groovy",
            ).toString();

            // 1. Open the script (tracks + writes + locks).
            await editor.open(openCommand("groovy", "v1"), FULL_EDITOR);
            expect(internals.scripts.has(scriptId)).toBe(true);

            // 2. Element deletion requests a close — the file deletion is deferred
            //    to the host's didClose ack.
            editor.applyModelChange(
                new UpdateScriptSourceCommand("Task_1", "script-task", undefined, undefined),
                FULL_EDITOR,
            );
            expect(internals.scripts.has(scriptId)).toBe(false);

            // 3. The script re-opens inside that window: the pending ack is
            //    cancelled and the next didClose is armed to be swallowed.
            await editor.open(openCommand("groovy", "v2"), FULL_EDITOR);
            expect(internals.scripts.has(scriptId)).toBe(true);
            const filesBeforeLateClose = new Map(host.workspace.files);

            // 4. The host still emits one late didClose for the pre-empted close.
            await editor.didClose(scriptId);

            // The re-tracked entry, its file path, and the lock all survive; no
            // deferred deletion ran.
            expect(internals.scripts.has(scriptId)).toBe(true);
            expect(internals.filePathByScript.has(scriptId)).toBe(true);
            expect(host.workspace.files).toEqual(filesBeforeLateClose);
            expect(lastLockRefs(modelerEditor)).toHaveLength(1);
        });
    });
});
