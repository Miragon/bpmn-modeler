import { describe, expect, it, vi } from "vitest";

import { Rpc } from "./rpc";

/** Parses the single most-recent frame a write spy captured. */
function lastFrame(write: ReturnType<typeof vi.fn>): any {
    const calls = write.mock.calls;
    return JSON.parse(calls[calls.length - 1][0] as string);
}

describe("Rpc framing", () => {
    it("notify emits a method+params frame with no id", () => {
        const write = vi.fn();
        new Rpc(write).notify("notifier/log", { level: "info", message: "hi" });

        expect(lastFrame(write)).toEqual({
            method: "notifier/log",
            params: { level: "info", message: "hi" },
        });
    });

    it("request emits a correlated frame and resolves on a matching response", async () => {
        const write = vi.fn();
        const rpc = new Rpc(write);

        const pending = rpc.request("document/write", { editorId: "e1" });
        const frame = lastFrame(write);
        expect(frame).toMatchObject({ method: "document/write", id: expect.any(Number) });

        await rpc.handleLine(JSON.stringify({ id: frame.id, result: { changed: true } }));
        await expect(pending).resolves.toEqual({ changed: true });
    });

    it("request rejects when the response carries an error", async () => {
        const write = vi.fn();
        const rpc = new Rpc(write);

        const pending = rpc.request("document/save", {});
        const { id } = lastFrame(write);
        await rpc.handleLine(JSON.stringify({ id, error: "disk full" }));

        await expect(pending).rejects.toThrow("disk full");
    });

    it("concurrent requests resolve independently by id", async () => {
        const write = vi.fn();
        const rpc = new Rpc(write);

        const first = rpc.request("a", {});
        const firstId = lastFrame(write).id;
        const second = rpc.request("b", {});
        const secondId = lastFrame(write).id;
        expect(secondId).not.toBe(firstId);

        // Resolve out of order to prove correlation, not arrival order, decides.
        await rpc.handleLine(JSON.stringify({ id: secondId, result: 2 }));
        await rpc.handleLine(JSON.stringify({ id: firstId, result: 1 }));
        await expect(first).resolves.toBe(1);
        await expect(second).resolves.toBe(2);
    });
});

describe("Rpc inbound dispatch", () => {
    it("serializes inbound method handlers in wire order", async () => {
        const rpc = new Rpc(vi.fn());
        const order: string[] = [];
        let finishRegister: () => void = () => {};
        rpc.on("session/register", async () => {
            order.push("register:start");
            await new Promise<void>((resolve) => {
                finishRegister = resolve;
            });
            order.push("register:end");
        });
        rpc.on("session/dispose", () => order.push("dispose"));

        const registering = rpc.handleLine(
            JSON.stringify({ method: "session/register", params: { editorId: "e1" } }),
        );
        const disposing = rpc.handleLine(
            JSON.stringify({ method: "session/dispose", params: { editorId: "e1" } }),
        );
        await Promise.resolve();

        expect(order).toEqual(["register:start"]);
        finishRegister();
        await Promise.all([registering, disposing]);
        expect(order).toEqual(["register:start", "register:end", "dispose"]);
    });

    it("does not block another editor behind a long-running handler", async () => {
        const rpc = new Rpc(vi.fn());
        const order: string[] = [];
        let finishFirst: () => void = () => {};
        rpc.on("command/changeEngineVersion", async (params) => {
            order.push(`${params.editorId}:start`);
            if (params.editorId === "e1") {
                await new Promise<void>((resolve) => {
                    finishFirst = resolve;
                });
            }
            order.push(`${params.editorId}:end`);
        });

        const first = rpc.handleLine(
            JSON.stringify({
                method: "command/changeEngineVersion",
                params: { editorId: "e1" },
            }),
        );
        const second = rpc.handleLine(
            JSON.stringify({
                method: "command/changeEngineVersion",
                params: { editorId: "e2" },
            }),
        );
        await Promise.resolve();
        await second;

        expect(order).toEqual(["e1:start", "e2:start", "e2:end"]);
        finishFirst();
        await first;
    });

    it("processes responses while an inbound handler is awaiting its request", async () => {
        const write = vi.fn();
        const rpc = new Rpc(write);
        rpc.on("webview/message", async () => {
            await rpc.request("document/write", { editorId: "e1" });
        });

        const handling = rpc.handleLine(JSON.stringify({ method: "webview/message", params: {} }));
        await Promise.resolve();
        const request = lastFrame(write);
        await rpc.handleLine(JSON.stringify({ id: request.id, result: { changed: true } }));

        await expect(handling).resolves.toBeUndefined();
    });

    it("runs a notification handler and never replies", async () => {
        const write = vi.fn();
        const rpc = new Rpc(write);
        const handler = vi.fn();
        rpc.on("session/register", handler);

        await rpc.handleLine(JSON.stringify({ method: "session/register", params: { id: "e1" } }));

        expect(handler).toHaveBeenCalledWith({ id: "e1" });
        expect(write).not.toHaveBeenCalled();
    });

    it("replies with the handler result when the inbound call carries an id", async () => {
        const write = vi.fn();
        const rpc = new Rpc(write);
        rpc.on("document/write", () => ({ changed: true }));

        await rpc.handleLine(JSON.stringify({ method: "document/write", params: {}, id: 7 }));

        expect(lastFrame(write)).toEqual({ id: 7, result: { changed: true } });
    });

    it("replies with an error frame when the handler throws", async () => {
        const write = vi.fn();
        const rpc = new Rpc(write);
        rpc.on("document/save", () => {
            throw new Error("nope");
        });

        await rpc.handleLine(JSON.stringify({ method: "document/save", params: {}, id: 9 }));

        expect(lastFrame(write)).toEqual({ id: 9, error: "nope" });
    });

    it("replies null to an inbound request with no registered handler", async () => {
        const write = vi.fn();
        const rpc = new Rpc(write);

        await rpc.handleLine(JSON.stringify({ method: "unknown/method", params: {}, id: 3 }));

        expect(lastFrame(write)).toEqual({ id: 3, result: null });
    });

    it("ignores blank lines", async () => {
        const write = vi.fn();
        const rpc = new Rpc(write);

        await rpc.handleLine("   ");
        await rpc.handleLine("");

        expect(write).not.toHaveBeenCalled();
    });

    it("drops a response with no matching pending request", async () => {
        const write = vi.fn();
        const rpc = new Rpc(write);

        // Must not throw; an orphan response (e.g. after a restart) is simply ignored.
        await rpc.handleLine(JSON.stringify({ id: 999, result: 1 }));

        expect(write).not.toHaveBeenCalled();
    });
});
