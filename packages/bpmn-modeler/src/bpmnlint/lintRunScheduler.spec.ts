import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LintRunScheduler, type LintRunTimers } from "./lintRunScheduler";

function fakeTimers(withIdleCallback = true) {
    const idleCallbacks = new Map<number, () => void>();
    let nextIdleHandle = 1;
    const timers: LintRunTimers = {
        now: () => Date.now(),
        setTimeout: vi.fn((callback: () => void, delayMs: number) => setTimeout(callback, delayMs)),
        clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
        ...(withIdleCallback && {
            requestIdleCallback: (callback: () => void) => {
                const handle = nextIdleHandle++;
                idleCallbacks.set(handle, callback);
                return handle;
            },
            cancelIdleCallback: (handle: unknown) => {
                idleCallbacks.delete(handle as number);
            },
        }),
    };
    const flushIdle = () => {
        const callbacks = [...idleCallbacks.values()];
        idleCallbacks.clear();
        callbacks.forEach((callback) => callback());
    };
    return { timers, flushIdle, pendingIdleCallbacks: () => idleCallbacks.size };
}

function controllableRuns() {
    const runs: { isCurrent: () => boolean; finish: () => void }[] = [];
    const run = vi.fn(
        (isCurrent: () => boolean) =>
            new Promise<void>((resolve) => {
                runs.push({ isCurrent, finish: resolve });
            }),
    );
    return { run, runs };
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("LintRunScheduler", () => {
    it("coalesces a burst of requests into one run once the canvas is quiet and idle", () => {
        const { timers, flushIdle, pendingIdleCallbacks } = fakeTimers();
        const { run } = controllableRuns();
        const scheduler = new LintRunScheduler(run, timers);

        scheduler.request();
        vi.advanceTimersByTime(250);
        scheduler.request();
        vi.advanceTimersByTime(250);
        scheduler.request();
        vi.advanceTimersByTime(250);
        expect(pendingIdleCallbacks()).toBe(0);

        vi.runAllTimers();
        expect(run).not.toHaveBeenCalled();

        flushIdle();
        expect(run).toHaveBeenCalledTimes(1);
    });

    it("arms the quiet period only after the triggering task ends", () => {
        const { timers } = fakeTimers();
        const scheduler = new LintRunScheduler(controllableRuns().run, timers);

        scheduler.request();
        expect(vi.mocked(timers.setTimeout).mock.calls.map(([, delayMs]) => delayMs)).toEqual([0]);

        vi.advanceTimersByTime(0);
        expect(vi.mocked(timers.setTimeout)).toHaveBeenCalledTimes(2);
        expect(vi.mocked(timers.setTimeout).mock.calls[1][1]).toBeGreaterThan(0);
    });

    it("stretches the quiet period to the duration of the last run", async () => {
        const { timers, flushIdle, pendingIdleCallbacks } = fakeTimers();
        const { run, runs } = controllableRuns();
        const scheduler = new LintRunScheduler(run, timers);
        scheduler.request();
        vi.runAllTimers();
        flushIdle();
        vi.advanceTimersByTime(2000);
        runs[0].finish();
        await vi.advanceTimersByTimeAsync(0);

        scheduler.request();
        vi.advanceTimersByTime(1500);
        scheduler.request();
        vi.advanceTimersByTime(1500);
        expect(pendingIdleCallbacks()).toBe(0);

        vi.advanceTimersByTime(500);
        expect(pendingIdleCallbacks()).toBe(1);
    });

    it("falls back to a timeout when requestIdleCallback is unavailable", () => {
        const { timers } = fakeTimers(false);
        const { run } = controllableRuns();
        const scheduler = new LintRunScheduler(run, timers);

        scheduler.request();
        vi.runAllTimers();

        expect(run).toHaveBeenCalledTimes(1);
    });

    it("queues exactly one trailing run for requests during a run", async () => {
        const { timers, flushIdle } = fakeTimers();
        const { run, runs } = controllableRuns();
        const scheduler = new LintRunScheduler(run, timers);
        scheduler.request();
        vi.runAllTimers();
        flushIdle();

        scheduler.request();
        scheduler.request();
        vi.runAllTimers();
        flushIdle();
        expect(run).toHaveBeenCalledTimes(1);

        runs[0].finish();
        await vi.runAllTimersAsync();
        flushIdle();
        expect(run).toHaveBeenCalledTimes(2);

        runs[1].finish();
        await vi.runAllTimersAsync();
        flushIdle();
        expect(run).toHaveBeenCalledTimes(2);
    });

    it("cancel drops a pending request", () => {
        const { timers, flushIdle } = fakeTimers();
        const { run } = controllableRuns();
        const scheduler = new LintRunScheduler(run, timers);

        scheduler.request();
        vi.runAllTimers();
        scheduler.cancel();
        flushIdle();
        vi.runAllTimers();

        expect(run).not.toHaveBeenCalled();
    });

    it("cancel marks the run in flight stale and drops its queued trailing run", async () => {
        const { timers, flushIdle } = fakeTimers();
        const { run, runs } = controllableRuns();
        const scheduler = new LintRunScheduler(run, timers);
        scheduler.request();
        vi.runAllTimers();
        flushIdle();
        scheduler.request();

        scheduler.cancel();
        expect(runs[0].isCurrent()).toBe(false);

        runs[0].finish();
        await vi.runAllTimersAsync();
        flushIdle();
        expect(run).toHaveBeenCalledTimes(1);
    });

    it("runs a request made after cancel once the stale run settles", async () => {
        const { timers, flushIdle } = fakeTimers();
        const { run, runs } = controllableRuns();
        const scheduler = new LintRunScheduler(run, timers);
        scheduler.request();
        vi.runAllTimers();
        flushIdle();

        scheduler.cancel();
        scheduler.request();
        runs[0].finish();
        await vi.runAllTimersAsync();
        flushIdle();

        expect(run).toHaveBeenCalledTimes(2);
        expect(runs[1].isCurrent()).toBe(true);
    });
});
