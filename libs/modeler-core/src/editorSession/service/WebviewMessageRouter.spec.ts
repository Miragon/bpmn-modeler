import { describe, expect, it, vi } from "vitest";

import { Command, ShowInfoCommand } from "@miragon/bpmn-modeler-shared";

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
        const router = new WebviewMessageRouter().on("ShowInfoCommand", handler);

        const message = new ShowInfoCommand("hello");
        await router.dispatch(message, "file:///a.bpmn");

        expect(handler).toHaveBeenCalledWith(message, "file:///a.bpmn");
    });

    it("is a no-op for an unregistered type", async () => {
        const handler = vi.fn();
        const router = new WebviewMessageRouter().on("ShowInfoCommand", handler);

        await router.dispatch(new TestCommand("UnknownCommand"), "file:///a.bpmn");

        expect(handler).not.toHaveBeenCalled();
    });

    it("runs multiple handlers for the same type in registration order", async () => {
        const calls: string[] = [];
        const router = new WebviewMessageRouter()
            .on("ShowInfoCommand", () => {
                calls.push("first");
            })
            .on("ShowInfoCommand", () => {
                calls.push("second");
            });

        await router.dispatch(new ShowInfoCommand("hello"), "id");

        expect(calls).toEqual(["first", "second"]);
    });

    it("awaits each async handler before starting the next", async () => {
        const calls: string[] = [];
        const router = new WebviewMessageRouter()
            .on("ShowInfoCommand", async () => {
                await Promise.resolve();
                calls.push("first");
            })
            .on("ShowInfoCommand", () => {
                calls.push("second");
            });

        await router.dispatch(new ShowInfoCommand("hello"), "id");

        expect(calls).toEqual(["first", "second"]);
    });

    it("routeOf reports handled, ignored (with reason) or unrouted", () => {
        const router = new WebviewMessageRouter()
            .on("ShowInfoCommand", () => undefined)
            .ignore("GetDiagramAsSVGCommand", "the export request reads the reply itself");

        expect(router.routeOf("ShowInfoCommand")).toEqual({ kind: "handled" });
        expect(router.routeOf("GetDiagramAsSVGCommand")).toEqual({
            kind: "ignored",
            reason: "the export request reads the reply itself",
        });
        expect(router.routeOf("RequestFocusCommand")).toEqual({ kind: "unrouted" });
    });

    it("refuses to ignore a command it handles", () => {
        const router = new WebviewMessageRouter().on("ShowInfoCommand", () => undefined);

        expect(() => router.ignore("ShowInfoCommand", "no notifications")).toThrow(
            "ShowInfoCommand is handled, so it cannot be ignored",
        );
        expect(router.routeOf("ShowInfoCommand")).toEqual({ kind: "handled" });
    });

    it("refuses to ignore a command without a reason", () => {
        const router = new WebviewMessageRouter();

        expect(() => router.ignore("ShowInfoCommand", "")).toThrow(
            "ShowInfoCommand needs a reason to be ignored",
        );
        expect(() => router.ignore("ShowInfoCommand", "  ")).toThrow(
            "ShowInfoCommand needs a reason to be ignored",
        );
        expect(router.routeOf("ShowInfoCommand")).toEqual({ kind: "unrouted" });
    });

    it("refuses to ignore a command twice", () => {
        const router = new WebviewMessageRouter().ignore("ShowInfoCommand", "no notifications");

        expect(() => router.ignore("ShowInfoCommand", "muted")).toThrow(
            "ShowInfoCommand is already ignored (no notifications)",
        );
        expect(router.routeOf("ShowInfoCommand")).toEqual({
            kind: "ignored",
            reason: "no notifications",
        });
    });

    it("handles or ignores every type a table lists, as the table says", () => {
        const router = WebviewMessageRouter.fromTable({
            ShowInfoCommand: [() => undefined],
            GetDiagramAsSVGCommand: { ignored: "the export request reads the reply itself" },
        });

        expect(router.routeOf("ShowInfoCommand")).toEqual({ kind: "handled" });
        expect(router.routeOf("GetDiagramAsSVGCommand")).toEqual({
            kind: "ignored",
            reason: "the export request reads the reply itself",
        });
        expect(router.routeOf("RequestFocusCommand")).toEqual({ kind: "unrouted" });
    });

    it("runs a table entry's handlers in the order it lists them", async () => {
        const calls: string[] = [];
        const router = WebviewMessageRouter.fromTable({
            ShowInfoCommand: [
                (message) => {
                    calls.push(`first ${message.message}`);
                },
                (_message, editorId) => {
                    calls.push(`second ${editorId}`);
                },
            ],
        });

        await router.dispatch(new ShowInfoCommand("hello"), "id");

        expect(calls).toEqual(["first hello", "second id"]);
    });

    it("refuses a handler for a command it ignores", () => {
        const router = new WebviewMessageRouter().ignore("ShowInfoCommand", "no notifications");

        expect(() => router.on("ShowInfoCommand", () => undefined)).toThrow(
            "ShowInfoCommand is ignored (no notifications), so it cannot be handled",
        );
        expect(router.routeOf("ShowInfoCommand")).toEqual({
            kind: "ignored",
            reason: "no notifications",
        });
    });
});
