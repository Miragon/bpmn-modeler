import { describe, expect, it, vi } from "vitest";

import { Command } from "@miragon/bpmn-modeler-shared";

import { WebviewMessageRouter } from "./WebviewMessageRouter";

/** Minimal concrete `Command` for driving the router in tests. */
class TestCommand extends Command {
    constructor(type: string) {
        super(type);
    }
}

describe("WebviewMessageRouter", () => {
    it("dispatches a registered handler with the message and editor id", async () => {
        const handler = vi.fn();
        const router = new WebviewMessageRouter().on("FooCommand", handler);

        const message = new TestCommand("FooCommand");
        await router.dispatch(message, "file:///a.bpmn");

        expect(handler).toHaveBeenCalledWith(message, "file:///a.bpmn");
    });

    it("is a no-op for an unregistered type", async () => {
        const handler = vi.fn();
        const router = new WebviewMessageRouter().on("FooCommand", handler);

        await router.dispatch(new TestCommand("UnknownCommand"), "file:///a.bpmn");

        expect(handler).not.toHaveBeenCalled();
    });

    it("runs multiple handlers for the same type in registration order", async () => {
        const calls: string[] = [];
        const router = new WebviewMessageRouter()
            .on("FooCommand", () => {
                calls.push("first");
            })
            .on("FooCommand", () => {
                calls.push("second");
            });

        await router.dispatch(new TestCommand("FooCommand"), "id");

        expect(calls).toEqual(["first", "second"]);
    });

    it("awaits each async handler before starting the next", async () => {
        const calls: string[] = [];
        const router = new WebviewMessageRouter()
            .on("FooCommand", async () => {
                await Promise.resolve();
                calls.push("first");
            })
            .on("FooCommand", () => {
                calls.push("second");
            });

        await router.dispatch(new TestCommand("FooCommand"), "id");

        expect(calls).toEqual(["first", "second"]);
    });
});
