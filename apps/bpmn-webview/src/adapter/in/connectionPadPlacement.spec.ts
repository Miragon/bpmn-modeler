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
type PadOpenListener = (event: { current: { target: unknown; html: HTMLElement } }) => void;

function build() {
    const selectionListeners: { priority: number; listener: SelectionListener }[] = [];
    const padOpenListeners: PadOpenListener[] = [];
    const eventBus = {
        on: vi.fn((event: string, ...rest: unknown[]) => {
            if (event === "selection.changed") {
                const [priority, listener] = rest as [number, SelectionListener];
                selectionListeners.push({ priority, listener });
            }
            if (event === "contextPad.open") padOpenListeners.push(rest[0] as PadOpenListener);
        }),
    };
    const contextPad = { open: vi.fn() };
    const placement = new ConnectionPadPlacement(contextPad, eventBus);
    const select = (...newSelection: object[]) =>
        selectionListeners.forEach(({ listener }) => listener({ newSelection }));
    const openPad = (target: unknown) => {
        const html = document.createElement("div");
        padOpenListeners.forEach((listener) => listener({ current: { target, html } }));
        return html;
    };
    return { placement, contextPad, selectionListeners, select, openPad };
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

    it("marks a connection's pad, which its stylesheet lifts above the connection's right end", () => {
        const { openPad } = build();

        expect(openPad([FLOW]).classList).toContain(ConnectionPadPlacement.ABOVE_CONNECTION);
        expect(openPad(TASK).classList).not.toContain(ConnectionPadPlacement.ABOVE_CONNECTION);
        expect(openPad([FLOW, TASK]).classList).not.toContain(
            ConnectionPadPlacement.ABOVE_CONNECTION,
        );
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
