import { afterEach, describe, expect, it, vi } from "vitest";

import { createResolver } from "./utils";

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
