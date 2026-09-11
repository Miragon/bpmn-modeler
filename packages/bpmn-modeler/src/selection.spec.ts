import { describe, expect, it, vi } from "vitest";

import { SelectionManager } from "./selection";

/**
 * Builds a `SelectionManager` over a fake element registry (only `elements`
 * exist) and a spy `selection.select`, so the resolved argument can be asserted.
 */
function setup(elements: Record<string, unknown>) {
    const registry = { get: (id: string) => elements[id] };
    const select = vi.fn();
    const selection = { select, get: () => [] };
    const manager = new SelectionManager((name: string) => {
        if (name === "elementRegistry") return registry as any;
        if (name === "selection") return selection as any;
        throw new Error(`unexpected service: ${name}`);
    });
    return { manager, select };
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
