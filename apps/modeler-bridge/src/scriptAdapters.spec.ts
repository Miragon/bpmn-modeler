import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UpdateScriptContentQuery, UpdateScriptSourceCommand } from "@miragon/bpmn-modeler-shared";

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
const EDITOR_ID = "file:///repo/process.bpmn";
const SCRIPT_ID = "script-1";
const ELEMENT_ID = "Task_1";

interface Internals {
    scripts: Map<string, unknown>;
    filePathByScript: Map<string, string>;
}

function createEditor() {
    const store = { postMessage: vi.fn().mockResolvedValue(true) };
    const rpc = { notify: vi.fn(), request: vi.fn(), on: vi.fn() };
    const notifier = { logError: vi.fn() };
    const workspace = { deleteDirectory: vi.fn().mockResolvedValue(undefined) };
    const picker = {};
    const settings = {};
    const manifestSvc = {};
    const artifactSvc = {};

    const editor = new BridgeScriptEditor(
        store as never,
        picker as never,
        rpc as never,
        notifier as never,
        settings as never,
        manifestSvc as never,
        workspace as never,
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
    internals.filePathByScript.set(SCRIPT_ID, "/base/hash/Task_1/slug/Task_1.js");

    return { editor, store, rpc, notifier, workspace };
}

/** UpdateScriptContentQuery posts only (skips lock broadcasts sharing the mock). */
function contentPosts(postMessage: { mock: { calls: unknown[][] } }): unknown[][] {
    return postMessage.mock.calls.filter(
        ([, message]) => (message as { type: string })?.type === "UpdateScriptContentQuery",
    );
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("BridgeScriptEditor keystroke debounce", () => {
    it("coalesces a burst of didChange into one trailing post with the latest content", async () => {
        const { editor, store } = createEditor();

        editor.didChange(SCRIPT_ID, "a");
        editor.didChange(SCRIPT_ID, "ab");
        editor.didChange(SCRIPT_ID, "abc");
        // Nothing posts before the window elapses.
        expect(contentPosts(store.postMessage)).toHaveLength(0);

        await vi.advanceTimersByTimeAsync(300);

        const posts = contentPosts(store.postMessage);
        expect(posts).toHaveLength(1);
        expect(posts[0]).toEqual([
            EDITOR_ID,
            new UpdateScriptContentQuery(ELEMENT_ID, "script-task", undefined, "abc"),
        ]);
    });

    it("does not post before the window elapses", async () => {
        const { editor, store } = createEditor();

        editor.didChange(SCRIPT_ID, "a");
        await vi.advanceTimersByTimeAsync(299);

        expect(contentPosts(store.postMessage)).toHaveLength(0);
    });

    it("ignores didChange for an unknown scriptId", async () => {
        const { editor, store } = createEditor();

        editor.didChange("nope", "x");
        await vi.advanceTimersByTimeAsync(300);

        expect(store.postMessage).not.toHaveBeenCalled();
    });

    it("flushes the pending keystroke before releasing on didClose", async () => {
        const { editor, store, workspace } = createEditor();

        editor.didChange(SCRIPT_ID, "last");
        // Close arrives inside the debounce window; the flush must still deliver.
        await editor.didClose(SCRIPT_ID);

        const posts = contentPosts(store.postMessage);
        expect(posts).toHaveLength(1);
        expect(posts[0][1]).toEqual(
            new UpdateScriptContentQuery(ELEMENT_ID, "script-task", undefined, "last"),
        );
        // A user-initiated close must not delete the file (a re-open has to work);
        // it only drops the path entry so `open` rewrites fresh content.
        expect(workspace.deleteDirectory).not.toHaveBeenCalled();
        expect((editor as unknown as Internals).filePathByScript.has(SCRIPT_ID)).toBe(false);
    });

    it("cancels a pending keystroke when the model overwrites the tab", async () => {
        const { editor, store, rpc } = createEditor();

        editor.didChange(SCRIPT_ID, "stale");
        editor.applyModelChange(
            new UpdateScriptSourceCommand(ELEMENT_ID, "script-task", undefined, "undone"),
            EDITOR_ID,
        );
        await vi.advanceTimersByTimeAsync(300);

        // The stale keystroke never streamed back (it would clobber the undo).
        expect(contentPosts(store.postMessage)).toHaveLength(0);
        expect(rpc.notify).toHaveBeenCalledWith(METHODS.scriptUpdateContent, {
            scriptId: SCRIPT_ID,
            content: "undone",
        });
    });

    it("drops a pending keystroke when the script surface disappears", async () => {
        const { editor, store, rpc } = createEditor();

        editor.didChange(SCRIPT_ID, "stale");
        editor.applyModelChange(
            // `content` omitted: the element is gone.
            new UpdateScriptSourceCommand(ELEMENT_ID, "script-task", undefined, undefined),
            EDITOR_ID,
        );
        await vi.advanceTimersByTimeAsync(300);

        expect(contentPosts(store.postMessage)).toHaveLength(0);
        expect(rpc.notify).toHaveBeenCalledWith(METHODS.scriptClose, { scriptId: SCRIPT_ID });
    });

    it("best-effort flushes the pending keystroke on editor dispose", async () => {
        const { editor, store, rpc } = createEditor();

        editor.didChange(SCRIPT_ID, "final");
        editor.disposeEditor(EDITOR_ID);
        // Let the flush's in-flight post settle.
        await vi.advanceTimersByTimeAsync(0);

        const posts = contentPosts(store.postMessage);
        expect(posts).toHaveLength(1);
        expect(posts[0][1]).toEqual(
            new UpdateScriptContentQuery(ELEMENT_ID, "script-task", undefined, "final"),
        );
        expect(rpc.notify).toHaveBeenCalledWith(METHODS.scriptClose, { scriptId: SCRIPT_ID });
    });
});
