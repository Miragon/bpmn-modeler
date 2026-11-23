import { describe, expect, it, vi } from "vitest";

import { ConnectionPadPlacement, connectionPadPlacementModule } from "./connectionPadPlacement";

const TASK = { id: "Task_1" };
const FLOW = {
    id: "Flow_1",
    waypoints: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
    ],
};

type SelectionListener = (event: { newSelection: readonly object[] }) => void;

function build() {
    const selectionListeners: { priority: number; listener: SelectionListener }[] = [];
    const eventBus = {
        on: vi.fn((event: string, priority: number, listener: SelectionListener) => {
            if (event === "selection.changed") selectionListeners.push({ priority, listener });
        }),
    };
    const contextPad = { open: vi.fn() };
    const placement = new ConnectionPadPlacement(contextPad, eventBus);
    const select = (...newSelection: object[]) =>
        selectionListeners.forEach(({ listener }) => listener({ newSelection }));
    return { placement, contextPad, selectionListeners, select };
}

describe("ConnectionPadPlacement", () => {
    it("opens a selected connection's pad above its right end, as on a shape, not on its arrowhead", () => {
        const { contextPad, select, selectionListeners } = build();

        select(FLOW);

        // After diagram-js's own handler (priority 1000) opened the pad on the arrowhead.
        expect(selectionListeners.map(({ priority }) => priority)).toEqual([500]);
        expect(contextPad.open).toHaveBeenCalledExactlyOnceWith([FLOW], true);
    });

    it("leaves a shape's pad and a multi-selection's pad where diagram-js puts them", () => {
        const { contextPad, select } = build();

        select(TASK);
        select(FLOW, TASK);
        select();

        expect(contextPad.open).not.toHaveBeenCalled();
    });

    it("names the pad target it opens for an element", () => {
        const { placement } = build();

        expect(placement.padTargetOf(FLOW)).toEqual([FLOW]);
        expect(placement.padTargetOf(TASK)).toBe(TASK);
    });

    it("finds the element a single-element pad was opened for", () => {
        expect(ConnectionPadPlacement.elementOf(TASK)).toBe(TASK);
        expect(ConnectionPadPlacement.elementOf([FLOW])).toBe(FLOW);
        expect(ConnectionPadPlacement.elementOf([FLOW, TASK])).toBeUndefined();
    });

    it("comes as a module that sets itself up with the pane", () => {
        expect(connectionPadPlacementModule.__init__).toEqual(["connectionPadPlacement"]);
        expect(connectionPadPlacementModule.connectionPadPlacement).toEqual([
            "type",
            ConnectionPadPlacement,
        ]);
    });
});
