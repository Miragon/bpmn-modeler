import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UpdateScriptContentQuery } from "@miragon/bpmn-modeler-shared";

import { createTestHost } from "../../testing/createTestHost";
import { OpenScriptTab } from "../domain/OpenScriptTabs";
import { SCRIPT_STREAM_DEBOUNCE_MS, ScriptContentStream } from "./ScriptContentStream";

const TASK_PATH = "/scripts/Task_1.groovy";
const LISTENER_PATH = "/scripts/start.groovy";

function scriptTaskOf(editorId: string): OpenScriptTab {
    return { editorId, elementId: "Task_1", kind: "script-task", listenerIndex: undefined };
}

function createStream() {
    const host = createTestHost();
    const diagram = host.openEditor("/ws/order.bpmn");
    const hiddenEditors: string[] = [];
    const stream = new ScriptContentStream(host.store, host.notifier, (editorId) =>
        hiddenEditors.push(editorId),
    );
    const task = scriptTaskOf(diagram.id);
    const listener: OpenScriptTab = {
        editorId: diagram.id,
        elementId: "Task_1",
        kind: "execution-listener",
        listenerIndex: 0,
    };
    return { host, diagram, stream, hiddenEditors, task, listener };
}

const contentOf = (tab: OpenScriptTab, content: string) =>
    new UpdateScriptContentQuery(tab.elementId, tab.kind, tab.listenerIndex, content);

describe("ScriptContentStream", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("streams a burst of edits as one update with the last content once typing pauses", async () => {
        const { diagram, stream, hiddenEditors, task } = createStream();

        stream.push(TASK_PATH, task, "a");
        stream.push(TASK_PATH, task, "ab");
        await vi.advanceTimersByTimeAsync(SCRIPT_STREAM_DEBOUNCE_MS - 1);
        expect(diagram.posted).toEqual([]);

        await vi.advanceTimersByTimeAsync(1);
        expect(diagram.posted).toEqual([contentOf(task, "ab")]);
        expect(hiddenEditors).toEqual([]);
    });

    it("waits 300 ms for a pause", () => {
        expect(SCRIPT_STREAM_DEBOUNCE_MS).toBe(300);
    });

    it("streams each tab on its own", async () => {
        const { diagram, stream, task, listener } = createStream();

        stream.push(TASK_PATH, task, "task");
        stream.push(LISTENER_PATH, listener, "listener");
        await vi.advanceTimersByTimeAsync(SCRIPT_STREAM_DEBOUNCE_MS);

        expect(diagram.posted).toEqual([contentOf(task, "task"), contentOf(listener, "listener")]);
    });

    it("drops a pending edit on cancel and streams the next one", async () => {
        const { diagram, stream, task } = createStream();

        stream.push(TASK_PATH, task, "stale");
        stream.cancel(TASK_PATH);
        await vi.advanceTimersByTimeAsync(SCRIPT_STREAM_DEBOUNCE_MS);
        expect(diagram.posted).toEqual([]);

        stream.push(TASK_PATH, task, "fresh");
        await vi.advanceTimersByTimeAsync(SCRIPT_STREAM_DEBOUNCE_MS);
        expect(diagram.posted).toEqual([contentOf(task, "fresh")]);
    });

    it("streams a pending edit at once on flush", async () => {
        const { diagram, stream, task } = createStream();

        stream.push(TASK_PATH, task, "last keystroke");
        await stream.flush(TASK_PATH);

        expect(diagram.posted).toEqual([contentOf(task, "last keystroke")]);
    });

    it("flushes a tab with nothing pending without streaming", async () => {
        const { diagram, stream } = createStream();

        await stream.flush(TASK_PATH);

        expect(diagram.posted).toEqual([]);
    });

    it("cancels and stops a tab that never streamed", () => {
        const { stream } = createStream();

        expect(() => {
            stream.cancel(TASK_PATH);
            stream.stop(TASK_PATH);
        }).not.toThrow();
    });

    it("drops a pending edit on stop, and a tab opened again streams afresh", async () => {
        const { diagram, stream, task } = createStream();

        stream.push(TASK_PATH, task, "before close");
        stream.stop(TASK_PATH);
        await stream.flush(TASK_PATH);
        expect(diagram.posted).toEqual([]);

        stream.push(TASK_PATH, task, "reopened");
        await vi.advanceTimersByTimeAsync(SCRIPT_STREAM_DEBOUNCE_MS);
        expect(diagram.posted).toEqual([contentOf(task, "reopened")]);
    });

    it("reports the editor of an edit its hidden webview missed, without logging", async () => {
        const { host, diagram, stream, hiddenEditors, task } = createStream();
        diagram.hidden = true;

        stream.push(TASK_PATH, task, "typed while hidden");
        await vi.advanceTimersByTimeAsync(SCRIPT_STREAM_DEBOUNCE_MS);

        expect(hiddenEditors).toEqual([diagram.id]);
        expect(host.notifier.loggedErrors).toEqual([]);
    });

    it("logs an edit the webview cannot take and keeps streaming", async () => {
        const { host, diagram, stream, task } = createStream();
        const failure = new Error("webview gone");
        vi.spyOn(diagram, "postMessage").mockRejectedValueOnce(failure);

        stream.push(TASK_PATH, task, "lost");
        await vi.advanceTimersByTimeAsync(SCRIPT_STREAM_DEBOUNCE_MS);
        stream.push(TASK_PATH, task, "kept");
        await vi.advanceTimersByTimeAsync(SCRIPT_STREAM_DEBOUNCE_MS);

        expect(host.notifier.loggedErrors).toEqual([failure]);
        expect(diagram.posted).toEqual([contentOf(task, "kept")]);
    });

    it("needs no listener for hidden webviews", async () => {
        const host = createTestHost();
        const diagram = host.openEditor("/ws/order.bpmn");
        diagram.hidden = true;
        const stream = new ScriptContentStream(host.store, host.notifier);

        stream.push(TASK_PATH, scriptTaskOf(diagram.id), "typed while hidden");
        await vi.advanceTimersByTimeAsync(SCRIPT_STREAM_DEBOUNCE_MS);

        expect(host.notifier.loggedErrors).toEqual([]);
    });
});
