import { describe, expect, it, vi } from "vitest";

import { ElementSelectionManager } from "./selection";
import type { CoreServiceAccessor } from "./coreServices";

/**
 * Builds a `SelectionManager` over a fake element registry (only `elements`
 * exist) and a spy `selection.select`, so the resolved argument can be asserted.
 */
function setup(elements: Record<string, unknown>) {
    const registry = { get: (id: string) => elements[id] };
    const select = vi.fn();
    const selection = { select, get: () => [] };
    const listeners: Record<string, ((event: unknown) => void)[]> = {};
    const eventBus = {
        on: (event: string, handler: (event: unknown) => void) => {
            (listeners[event] ??= []).push(handler);
        },
        off: (event: string, handler: (event: unknown) => void) => {
            const handlers = listeners[event];
            if (!handlers) return;
            const index = handlers.indexOf(handler);
            if (index !== -1) handlers.splice(index, 1);
        },
    };
    const getService = ((name: string) => {
        if (name === "elementRegistry") return registry;
        if (name === "selection") return selection;
        if (name === "eventBus") return eventBus;
        throw new Error(`unexpected service: ${name}`);
    }) as unknown as CoreServiceAccessor;
    const manager = new ElementSelectionManager(getService);
    const emit = (event: string, payload?: unknown) =>
        (listeners[event] ?? []).forEach((handler) => handler(payload));
    const listenerCount = (event: string) => (listeners[event] ?? []).length;
    return { manager, select, emit, listenerCount };
}

describe("SelectionManager.selectElementsByIds", () => {
    it("clears the selection for an empty id list", () => {
        const { manager, select } = setup({ Task_1: {} });

        manager.selectElementsByIds([]);

        expect(select).toHaveBeenCalledWith([]);
    });

    it("clears the selection when every id is missing", () => {
        const { manager, select } = setup({ Task_1: {} });

        manager.selectElementsByIds(["gone_1", "gone_2"]);

        expect(select).toHaveBeenCalledWith([]);
    });

    it("selects the survivors when some ids are missing", () => {
        const task = { id: "Task_1" };
        const { manager, select } = setup({ Task_1: task });

        manager.selectElementsByIds(["Task_1", "gone"]);

        expect(select).toHaveBeenCalledWith([task]);
    });
});

describe("SelectionManager.onSelectionChanged", () => {
    it("reports the mapped ids of the new selection", () => {
        const { manager, emit } = setup({});
        const cb = vi.fn();
        manager.onSelectionChanged(cb);

        emit("selection.changed", { newSelection: [{ id: "Task_1" }, { id: "Task_2" }] });

        expect(cb).toHaveBeenCalledWith(["Task_1", "Task_2"]);
    });

    it("detaches its listener on dispose", () => {
        const { manager, emit, listenerCount } = setup({});
        const cb = vi.fn();

        const dispose = manager.onSelectionChanged(cb);
        dispose();
        emit("selection.changed", { newSelection: [{ id: "Task_1" }] });

        expect(cb).not.toHaveBeenCalled();
        expect(listenerCount("selection.changed")).toBe(0);
    });
});
