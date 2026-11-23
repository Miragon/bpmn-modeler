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
type PadListener = (event: { current: { target: unknown; html: HTMLElement } }) => void;

function build() {
    const selectionListeners: { priority: number; listener: SelectionListener }[] = [];
    const listeners = new Map<string, ((event?: unknown) => void)[]>();
    const eventBus = {
        on: vi.fn((event: string, ...rest: unknown[]) => {
            if (event === "selection.changed") {
                const [priority, listener] = rest as [number, SelectionListener];
                selectionListeners.push({ priority, listener });
                return;
            }
            listeners.set(event, [...(listeners.get(event) ?? []), rest[0] as () => void]);
        }),
    };
    const fire = (event: string, payload?: unknown) =>
        listeners.get(event)?.forEach((listener) => listener(payload));
    const contextPad = { open: vi.fn() };
    const canvas = { zoom: vi.fn(() => 1) };
    const placement = new ConnectionPadPlacement(contextPad, eventBus, canvas);
    const select = (...newSelection: object[]) =>
        selectionListeners.forEach(({ listener }) => listener({ newSelection }));
    const openPad = (target: unknown) => {
        const html = document.createElement("div");
        const event: Parameters<PadListener>[0] = { current: { target, html } };
        fire("contextPad.open", event);
        return html;
    };
    return { placement, contextPad, canvas, selectionListeners, select, openPad, fire };
}

const offsetOf = (html: HTMLElement) => [
    html.style.getPropertyValue("--connection-pad-dx"),
    html.style.getPropertyValue("--connection-pad-dy"),
];

describe("ConnectionPadPlacement", () => {
    it("reopens a selected connection's pad for the connection alone, not on its arrowhead", () => {
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

    it("moves a connection's pad from the top right of its bounds to centred above its middle", () => {
        const { openPad } = build();
        const bent = {
            id: "Flow_2",
            waypoints: [
                { x: 0, y: 100 },
                { x: 100, y: 100 },
                { x: 100, y: 0 },
                { x: 300, y: 0 },
            ],
        };

        // diagram-js puts the pad 8 right of x 300 at y 0; the middle, 200 along, is (100, 0).
        expect(offsetOf(openPad([bent]))).toEqual(["-208px", "0px"]);
    });

    it("keeps the pad above the middle as the zoom changes", () => {
        const { openPad, canvas, fire } = build();
        const html = openPad([FLOW]);

        canvas.zoom.mockReturnValue(2);
        fire("canvas.viewbox.changed");

        // The middle (50, 0) is 50 left of the right end, plus diagram-js's margin of 8.
        expect(offsetOf(html)).toEqual(["-116px", "0px"]);
    });

    it("stops following a pad once it closed", () => {
        const { openPad, canvas, fire } = build();
        const html = openPad([FLOW]);

        fire("contextPad.close");
        canvas.zoom.mockReturnValue(2);
        fire("canvas.viewbox.changed");

        expect(offsetOf(html)).toEqual(["-58px", "0px"]);
    });

    it("marks a connection's pad, which its stylesheet moves above the connection's middle", () => {
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
