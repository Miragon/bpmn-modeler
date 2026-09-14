import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DisposableStore } from "@miragon/bpmn-modeler-types";

import {
    createContentSavedNotifier,
    wireContentSaved,
    type ContentSavedWiring,
} from "./contentSaved";
import { createReporter } from "./reporting";

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

function wiring(overrides: Partial<ContentSavedWiring> = {}): ContentSavedWiring {
    return {
        exportDiagram: vi.fn().mockResolvedValue("<xml/>"),
        onContentSaved: vi.fn(),
        reporter: createReporter({}),
        isDisposed: () => false,
        ...overrides,
    };
}

describe("createContentSavedNotifier", () => {
    it("reports an export failure once and resolves the caller with undefined", async () => {
        const onError = vi.fn();
        const notifier = createContentSavedNotifier(
            wiring({
                exportDiagram: vi.fn().mockRejectedValue(new Error("export")),
                reporter: createReporter({ onError }),
            }),
        );

        const caller = notifier();
        await vi.advanceTimersByTimeAsync(300);

        expect(onError).toHaveBeenCalledTimes(1);
        await expect(caller).resolves.toBeUndefined();
    });

    it("reports a synchronous callback throw once", async () => {
        const onError = vi.fn();
        const notifier = createContentSavedNotifier(
            wiring({
                onContentSaved: vi.fn(() => {
                    throw new Error("sync");
                }),
                reporter: createReporter({ onError }),
            }),
        );

        const caller = notifier();
        await vi.advanceTimersByTimeAsync(300);

        expect(onError).toHaveBeenCalledTimes(1);
        await expect(caller).resolves.toBeUndefined();
    });

    it("reports an asynchronous callback rejection once", async () => {
        const onError = vi.fn();
        const notifier = createContentSavedNotifier(
            wiring({
                onContentSaved: vi.fn().mockRejectedValue(new Error("async")),
                reporter: createReporter({ onError }),
            }),
        );

        const caller = notifier();
        await vi.advanceTimersByTimeAsync(300);

        expect(onError).toHaveBeenCalledTimes(1);
        await expect(caller).resolves.toBeUndefined();
    });

    it("reports once for a burst coalesced into a single failing run", async () => {
        const onError = vi.fn();
        const notifier = createContentSavedNotifier(
            wiring({
                onContentSaved: vi.fn().mockRejectedValue(new Error("boom")),
                reporter: createReporter({ onError }),
            }),
        );

        const callers = [notifier(), notifier(), notifier()];
        await vi.advanceTimersByTimeAsync(300);

        expect(onError).toHaveBeenCalledTimes(1);
        await expect(Promise.all(callers)).resolves.toEqual([undefined, undefined, undefined]);
    });

    it("keeps saving after a failure", async () => {
        const onError = vi.fn();
        const onContentSaved = vi
            .fn()
            .mockRejectedValueOnce(new Error("boom"))
            .mockResolvedValue(undefined);
        const notifier = createContentSavedNotifier(
            wiring({ onContentSaved, reporter: createReporter({ onError }) }),
        );

        void notifier();
        await vi.advanceTimersByTimeAsync(300);
        expect(onError).toHaveBeenCalledTimes(1);

        void notifier();
        await vi.advanceTimersByTimeAsync(300);

        expect(onContentSaved).toHaveBeenLastCalledWith({ xml: "<xml/>" });
        expect(onError).toHaveBeenCalledTimes(1);
    });

    it("falls back to console.error when no onError is set", async () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const notifier = createContentSavedNotifier(
            wiring({ onContentSaved: vi.fn().mockRejectedValue(new Error("boom")) }),
        );

        const caller = notifier();
        await vi.advanceTimersByTimeAsync(300);

        expect(consoleError).toHaveBeenCalledTimes(1);
        await expect(caller).resolves.toBeUndefined();
        consoleError.mockRestore();
    });

    it("suppresses failures reported after disposal", async () => {
        const onError = vi.fn();
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
        let disposed = false;
        const notifier = createContentSavedNotifier(
            wiring({
                onContentSaved: vi.fn().mockRejectedValue(new Error("boom")),
                reporter: createReporter({ onError }),
                isDisposed: () => disposed,
            }),
        );

        const caller = notifier();
        disposed = true;
        await vi.advanceTimersByTimeAsync(300);

        expect(onError).not.toHaveBeenCalled();
        expect(consoleError).not.toHaveBeenCalled();
        await expect(caller).resolves.toBeUndefined();
        consoleError.mockRestore();
    });
});

describe("wireContentSaved", () => {
    function fakeBus() {
        const handlers = new Map<string, Set<(...args: any[]) => void>>();
        return {
            on: (event: string, handler: (...args: any[]) => void) => {
                (handlers.get(event) ?? handlers.set(event, new Set()).get(event)!).add(handler);
            },
            off: (event: string, handler: (...args: any[]) => void) => {
                handlers.get(event)?.delete(handler);
            },
            fire: (event: string) => handlers.get(event)?.forEach((handler) => handler()),
            count: (event: string) => handlers.get(event)?.size ?? 0,
        };
    }

    it("saves on commandStack.changed and reports the disposal-suppressed failure via the store", async () => {
        const store = new DisposableStore();
        const eventBus = fakeBus();
        const onContentSaved = vi.fn();

        wireContentSaved({
            store,
            eventBus,
            exportDiagram: vi.fn().mockResolvedValue("<xml/>"),
            onContentSaved,
            reporter: createReporter({}),
        });

        eventBus.fire("commandStack.changed");
        await vi.advanceTimersByTimeAsync(300);

        expect(onContentSaved).toHaveBeenCalledWith({ xml: "<xml/>" });
    });

    it("unsubscribes and cancels the pending export on store dispose", async () => {
        const store = new DisposableStore();
        const eventBus = fakeBus();
        const onContentSaved = vi.fn();

        wireContentSaved({
            store,
            eventBus,
            exportDiagram: vi.fn().mockResolvedValue("<xml/>"),
            onContentSaved,
            reporter: createReporter({}),
        });

        eventBus.fire("commandStack.changed");
        store.dispose();
        await vi.advanceTimersByTimeAsync(300);

        expect(eventBus.count("commandStack.changed")).toBe(0);
        expect(onContentSaved).not.toHaveBeenCalled();
    });
});
