import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { settle } from "./__fixtures__/bridgeHarness";
import { METHODS } from "./protocol/descriptor";
import { Rpc } from "./rpc";

/** Parses the single most-recent frame a write spy captured. */
function lastFrame(write: ReturnType<typeof vi.fn>): any {
    const calls = write.mock.calls;
    return JSON.parse(calls[calls.length - 1][0] as string);
}

/** Records how a request settled without awaiting it, so a request that never settles fails an assertion. */
function outcomeOf(request: Promise<unknown>): { current: string } {
    const outcome = { current: "pending" };
    request.then(
        (result) => {
            outcome.current = `answered ${JSON.stringify(result)}`;
        },
        (error: Error) => {
            outcome.current = `rejected: ${error.message}`;
        },
    );
    return outcome;
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

describe("Rpc reply deadline", () => {
    const TWO_MINUTES_MS = 120_000;

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("rejects a request the peer never answers", async () => {
        const rpc = new Rpc(vi.fn());

        const save = outcomeOf(rpc.request(METHODS.documentSave, { editorId: "e1" }));
        await vi.advanceTimersByTimeAsync(TWO_MINUTES_MS - 1);
        expect(save.current).toBe("pending");
        await vi.advanceTimersByTimeAsync(1);

        expect(save.current).toBe("rejected: No reply to document/save within 120 s");
    });

    it("drops the deadline of a request the peer answered", async () => {
        const write = vi.fn();
        const rpc = new Rpc(write);

        const save = outcomeOf(rpc.request(METHODS.documentSave, { editorId: "e1" }));
        await rpc.handleLine(JSON.stringify({ id: lastFrame(write).id, result: { saved: true } }));
        await vi.advanceTimersByTimeAsync(0);

        expect(save.current).toBe('answered {"saved":true}');
        expect(vi.getTimerCount()).toBe(0);
    });

    it("waits for a prompt however long the user takes", async () => {
        const write = vi.fn();
        const rpc = new Rpc(write);

        const confirm = outcomeOf(rpc.request(METHODS.confirmShow, { title: "Remove?" }));
        await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
        expect(confirm.current).toBe("pending");
        await rpc.handleLine(
            JSON.stringify({ id: lastFrame(write).id, result: { confirmed: true } }),
        );

        expect(confirm.current).toBe('answered {"confirmed":true}');
    });

    it("handles a later call for the same editor after a request timed out", async () => {
        const rpc = new Rpc(vi.fn());
        const handled: string[] = [];
        rpc.on("webview/message", async (params) => {
            if (params.step === "save") {
                await rpc.request(METHODS.documentSave, { editorId: params.editorId });
            }
            handled.push(params.step);
        });

        const saving = rpc.handleLine(
            JSON.stringify({ method: "webview/message", params: { editorId: "e1", step: "save" } }),
        );
        void saving.catch(() => undefined);
        void rpc.handleLine(
            JSON.stringify({ method: "webview/message", params: { editorId: "e1", step: "next" } }),
        );
        await vi.advanceTimersByTimeAsync(TWO_MINUTES_MS);

        expect(handled).toEqual(["next"]);
        await expect(saving).rejects.toThrow("No reply to document/save within 120 s");
    });
});

describe("Rpc end of input", () => {
    it("rejects every outstanding request when the input ends", async () => {
        const rpc = new Rpc(vi.fn());

        const confirm = outcomeOf(rpc.request(METHODS.confirmShow, { title: "Remove?" }));
        const write = outcomeOf(rpc.request(METHODS.documentWrite, { editorId: "e1" }));
        rpc.handleEnd();
        await settle();

        expect([confirm.current, write.current]).toEqual([
            "rejected: No reply to confirm/show: the input ended",
            "rejected: No reply to document/write: the input ended",
        ]);
    });

    it("rejects a request made after the input ended without sending it", async () => {
        const write = vi.fn();
        const rpc = new Rpc(write);

        rpc.handleEnd();
        const save = outcomeOf(rpc.request(METHODS.documentSave, { editorId: "e1" }));
        await settle();

        expect(save.current).toBe("rejected: No reply to document/save: the input ended");
        expect(write).not.toHaveBeenCalled();
    });
});
