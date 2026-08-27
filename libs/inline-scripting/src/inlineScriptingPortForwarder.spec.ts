import { describe, expect, it, vi } from "vitest";

import { OPEN_SCRIPT_EDITOR_EVENT } from "./scriptTaskContextPad";
import { SCRIPT_SOURCE_CHANGED_EVENT } from "./scriptSourceWatcher";
import { InlineScriptingPortForwarder } from "./inlineScriptingPortForwarder";

/** Records event-bus subscriptions so the test can fire them by name. */
function fakeEventBus() {
    const handlers: Record<string, ((event: unknown) => void)[]> = {};
    return {
        on: (event: string, callback: (event: unknown) => void) => {
            (handlers[event] ??= []).push(callback);
        },
        fire: (event: string, payload: unknown) =>
            (handlers[event] ?? []).forEach((callback) => callback(payload)),
    };
}

describe("InlineScriptingPortForwarder", () => {
    it("forwards scriptEditor.open to the port", () => {
        const bus = fakeEventBus();
        const port = { openScriptEditor: vi.fn(), scriptSourceChanged: vi.fn() };
        new InlineScriptingPortForwarder(bus as never, port);

        const event = {
            elementId: "Task_1",
            kind: "script-task",
            listenerIndex: undefined,
            eventName: undefined,
            scriptFormat: "groovy",
            content: "x = 1",
        };
        bus.fire(OPEN_SCRIPT_EDITOR_EVENT, event);

        expect(port.openScriptEditor).toHaveBeenCalledWith(event);
        expect(port.scriptSourceChanged).not.toHaveBeenCalled();
    });

    it("forwards scriptEditor.sourceChanged to the port", () => {
        const bus = fakeEventBus();
        const port = { openScriptEditor: vi.fn(), scriptSourceChanged: vi.fn() };
        new InlineScriptingPortForwarder(bus as never, port);

        const event = {
            elementId: "Task_1",
            kind: "script-task",
            listenerIndex: undefined,
            content: "x = 2",
        };
        bus.fire(SCRIPT_SOURCE_CHANGED_EVENT, event);

        expect(port.scriptSourceChanged).toHaveBeenCalledWith(event);
        expect(port.openScriptEditor).not.toHaveBeenCalled();
    });
});
