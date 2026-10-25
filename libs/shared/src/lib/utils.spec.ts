import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createReplyRegistry, createResolver, HOST_REPLY_TIMEOUT_MS } from "./utils";

describe("createResolver", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("resolves wait() with the value passed to done()", async () => {
        const { wait, done } = createResolver<string>();

        done("answer");

        await expect(wait()).resolves.toBe("answer");
    });

    it("without a timeout, waits indefinitely until done() is called", async () => {
        vi.useFakeTimers();
        const { wait, done } = createResolver<string>();

        const settled = vi.fn();
        void wait().then(settled);

        await vi.advanceTimersByTimeAsync(100_000);
        expect(settled).not.toHaveBeenCalled();

        done("late");
        await Promise.resolve();
        expect(settled).toHaveBeenCalledWith("late");
    });

    it("wait(t) resolves to undefined once the timeout elapses without done()", async () => {
        vi.useFakeTimers();
        const { wait } = createResolver<string>();

        const promise = wait(5000);
        await vi.advanceTimersByTimeAsync(5000);

        await expect(promise).resolves.toBeUndefined();
    });

    it("wait(t) resolves to the real value when done() fires before the timeout", async () => {
        vi.useFakeTimers();
        const { wait, done } = createResolver<string>();

        const promise = wait(5000);
        done("in-time");
        await vi.advanceTimersByTimeAsync(5000);

        await expect(promise).resolves.toBe("in-time");
    });
});

describe("createReplyRegistry", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("settles each reply by its request id and ignores unknown ids", async () => {
        const replies = createReplyRegistry<string>();
        const first = replies.open();
        const second = replies.open();

        replies.settle(99, "stray");
        replies.settle(second.requestId, "second answer");
        replies.settle(first.requestId, "first answer");

        await expect(first.reply).resolves.toBe("first answer");
        await expect(second.reply).resolves.toBe("second answer");
    });

    it("resolves an unanswered reply to undefined at the deadline and ignores its late answer", async () => {
        const replies = createReplyRegistry<string>(1000);
        const { requestId, reply } = replies.open();
        const settled = vi.fn();
        void reply.then(settled);

        await vi.advanceTimersByTimeAsync(1000);
        expect(settled).toHaveBeenCalledWith(undefined);

        replies.settle(requestId, "late");
        await vi.advanceTimersByTimeAsync(0);
        expect(settled).toHaveBeenCalledOnce();
    });

    it("waits for the host reply timeout by default", async () => {
        const { reply } = createReplyRegistry<string>().open();
        const settled = vi.fn();
        void reply.then(settled);

        await vi.advanceTimersByTimeAsync(HOST_REPLY_TIMEOUT_MS - 1);
        expect(settled).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);
        expect(settled).toHaveBeenCalledWith(undefined);
    });

    it("hands out unique, increasing request ids", () => {
        const replies = createReplyRegistry<string>();

        const [first, second, third] = [replies.open(), replies.open(), replies.open()].map(
            ({ requestId }) => requestId,
        );

        expect(second).toBeGreaterThan(first);
        expect(third).toBeGreaterThan(second);
    });
});
