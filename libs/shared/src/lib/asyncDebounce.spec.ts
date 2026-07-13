import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { asyncDebounce } from "./asyncDebounce";

/**
 * Fake timers drive the lodash `debounce` core deterministically; each test
 * advances time explicitly rather than sleeping, mirroring `VsCodePicker.spec`.
 */
beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("asyncDebounce", () => {
    it("coalesces a burst into one trailing call with the latest args", async () => {
        const spy = vi.fn().mockResolvedValue("done");
        const debounced = asyncDebounce(spy, 300);

        void debounced("a");
        void debounced("b");
        void debounced("c");
        // Nothing has fired yet — the trailing edge is still pending.
        expect(spy).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(300);

        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith("c");
    });

    it("resolves every coalesced caller with the shared result", async () => {
        const spy = vi.fn().mockResolvedValue("shared");
        const debounced = asyncDebounce(spy, 300);

        const first = debounced("a");
        const second = debounced("b");
        await vi.advanceTimersByTimeAsync(300);

        await expect(first).resolves.toBe("shared");
        await expect(second).resolves.toBe("shared");
    });

    it("does not fire before the wait elapses", async () => {
        const spy = vi.fn().mockResolvedValue(undefined);
        const debounced = asyncDebounce(spy, 300);

        void debounced("a");
        await vi.advanceTimersByTimeAsync(299);

        expect(spy).not.toHaveBeenCalled();
    });

    it("flush fires the pending call immediately and awaits it settling", async () => {
        let settle: (value: string) => void = () => undefined;
        const spy = vi.fn().mockReturnValue(
            new Promise<string>((resolve) => {
                settle = resolve;
            }),
        );
        const debounced = asyncDebounce(spy, 300);

        void debounced("a");
        const flushed = debounced.flush();
        // Flush trips the timer synchronously, so the call has already fired.
        expect(spy).toHaveBeenCalledTimes(1);

        let done = false;
        void flushed.then(() => {
            done = true;
        });
        // Still pending: the async func has not resolved yet.
        await Promise.resolve();
        expect(done).toBe(false);

        settle("ok");
        await flushed;
        expect(done).toBe(true);
    });

    it("flush is a no-op when nothing is pending", async () => {
        const spy = vi.fn().mockResolvedValue(undefined);
        const debounced = asyncDebounce(spy, 300);

        await expect(debounced.flush()).resolves.toBeUndefined();
        expect(spy).not.toHaveBeenCalled();
    });

    it("cancel drops the pending call and settles its callers with undefined", async () => {
        const spy = vi.fn().mockResolvedValue("never");
        const debounced = asyncDebounce(spy, 300);

        const pending = debounced("a");
        debounced.cancel();
        await vi.advanceTimersByTimeAsync(300);

        expect(spy).not.toHaveBeenCalled();
        await expect(pending).resolves.toBeUndefined();
    });

    it("debounces normally again after a cancel", async () => {
        const spy = vi.fn().mockResolvedValue("done");
        const debounced = asyncDebounce(spy, 300);

        void debounced("a");
        debounced.cancel();

        void debounced("b");
        await vi.advanceTimersByTimeAsync(300);

        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith("b");
    });

    it("maxWait forces a call under a sustained sub-wait burst (no starvation)", async () => {
        const spy = vi.fn().mockResolvedValue("x");
        const debounced = asyncDebounce(spy, 300, { maxWait: 1000 });

        // Calls every 100ms keep resetting the 300ms trailing timer, so without
        // maxWait the invocation would be starved forever. maxWait caps it at ~1s,
        // so a burst carried past 1000ms must have fired at least once.
        for (let i = 0; i < 11; i++) {
            void debounced(`c${i}`);
            await vi.advanceTimersByTimeAsync(100);
        }

        expect(spy).toHaveBeenCalled();
    });

    it("does not fire at the trailing edge while the burst is still sub-wait", async () => {
        const spy = vi.fn().mockResolvedValue("x");
        const debounced = asyncDebounce(spy, 300, { maxWait: 1000 });

        // Two calls 100ms apart, then only 250ms — under both the 300ms wait and
        // the 1000ms maxWait — so nothing has fired yet.
        void debounced("a");
        await vi.advanceTimersByTimeAsync(100);
        void debounced("b");
        await vi.advanceTimersByTimeAsync(250);

        expect(spy).not.toHaveBeenCalled();
    });

    it("pending() tracks the scheduled → in-flight → settled lifecycle", async () => {
        let settle: (value: string) => void = () => undefined;
        const spy = vi.fn().mockReturnValue(
            new Promise<string>((resolve) => {
                settle = resolve;
            }),
        );
        const debounced = asyncDebounce(spy, 300);

        expect(debounced.pending()).toBe(false); // idle

        void debounced("a");
        expect(debounced.pending()).toBe(true); // scheduled

        await vi.advanceTimersByTimeAsync(300);
        expect(debounced.pending()).toBe(true); // in-flight (deferred func promise)

        settle("ok");
        await Promise.resolve();
        await Promise.resolve();
        expect(debounced.pending()).toBe(false); // settled
    });

    it("pending() is false after cancel", async () => {
        const spy = vi.fn().mockResolvedValue("x");
        const debounced = asyncDebounce(spy, 300);

        void debounced("a");
        expect(debounced.pending()).toBe(true);

        debounced.cancel();
        expect(debounced.pending()).toBe(false);
    });
});
