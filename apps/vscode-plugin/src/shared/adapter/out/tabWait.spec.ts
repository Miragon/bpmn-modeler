import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tabs = vi.hoisted(() => ({
    listeners: new Set<() => void>(),
}));

vi.mock("vscode", () => ({
    window: {
        tabGroups: {
            onDidChangeTabs: (listener: () => void) => {
                tabs.listeners.add(listener);
                return { dispose: () => tabs.listeners.delete(listener) };
            },
        },
    },
}));

import { untilTabsSatisfy } from "./tabWait";

const TIMEOUT_MS = 1_000;

function changeTabs(): void {
    [...tabs.listeners].forEach((listener) => listener());
}

function tracked(promise: Promise<void>): { readonly settled: boolean } {
    const state = { settled: false };
    void promise.then(() => {
        state.settled = true;
    });
    return state;
}

let onTimeout: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
    vi.useFakeTimers();
    tabs.listeners.clear();
    onTimeout = vi.fn<() => void>();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("untilTabsSatisfy", () => {
    it("resolves at once when the tabs already satisfy the condition", async () => {
        const waiting = tracked(untilTabsSatisfy(() => true, { timeoutMs: TIMEOUT_MS, onTimeout }));

        await vi.advanceTimersByTimeAsync(0);

        expect(waiting.settled).toBe(true);
        expect(tabs.listeners.size).toBe(0);
    });

    it("waits through tab changes until one satisfies the condition, then stops listening", async () => {
        let satisfied = false;
        const waiting = tracked(
            untilTabsSatisfy(() => satisfied, { timeoutMs: TIMEOUT_MS, onTimeout }),
        );

        changeTabs();
        await vi.advanceTimersByTimeAsync(0);
        expect(waiting.settled).toBe(false);

        satisfied = true;
        changeTabs();
        await vi.advanceTimersByTimeAsync(TIMEOUT_MS);

        expect(waiting.settled).toBe(true);
        expect(tabs.listeners.size).toBe(0);
        expect(onTimeout).not.toHaveBeenCalled();
    });

    it("tells the timeout and resolves when no tab change satisfies the condition in time", async () => {
        const waiting = tracked(untilTabsSatisfy(() => false, { timeoutMs: TIMEOUT_MS, onTimeout }));

        await vi.advanceTimersByTimeAsync(TIMEOUT_MS - 1);
        expect(waiting.settled).toBe(false);

        await vi.advanceTimersByTimeAsync(1);

        expect(waiting.settled).toBe(true);
        expect(onTimeout).toHaveBeenCalledTimes(1);
        expect(tabs.listeners.size).toBe(0);
    });
});
