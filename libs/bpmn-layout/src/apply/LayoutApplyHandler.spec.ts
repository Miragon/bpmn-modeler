import { describe, expect, it, vi } from "vitest";

import type { LayoutOperation } from "../types";
import { LayoutApplyHandler, MOVE_HINTS, RESIZE_HINTS, WAYPOINT_HINTS } from "./LayoutApplyHandler";

function harness(knownIds: string[]) {
    const modeling = {
        moveShape: vi.fn(),
        resizeShape: vi.fn(),
        updateWaypoints: vi.fn(),
    };
    const elements = new Map(knownIds.map((id) => [id, { id }]));
    const elementRegistry = { get: (id: string) => elements.get(id) };
    return { modeling, elementRegistry, element: (id: string) => elements.get(id) };
}

describe("LayoutApplyHandler", () => {
    // The hints are the contract with four bpmn-js behaviours that would
    // otherwise undo or double-apply this work. Asserting them here is what
    // makes a bpmn-js upgrade that changes them fail loudly instead of
    // silently producing a wrong layout.
    it("suppresses child recursion and connection re-layout on every move", () => {
        const { modeling, elementRegistry, element } = harness(["Task_1"]);
        const handler = new LayoutApplyHandler(modeling, elementRegistry);

        handler.preExecute({
            operations: [{ kind: "move", id: "Task_1", delta: { x: 40, y: 0 } }],
        });

        expect(modeling.moveShape).toHaveBeenCalledWith(
            element("Task_1"),
            { x: 40, y: 0 },
            undefined,
            MOVE_HINTS,
        );
        expect(MOVE_HINTS).toEqual({ layout: false, recurse: false });
    });

    it("suppresses attach support on every resize and never passes minBounds", () => {
        const { modeling, elementRegistry, element } = harness(["Participant_1"]);
        const handler = new LayoutApplyHandler(modeling, elementRegistry);
        const bounds = { x: 0, y: 0, width: 600, height: 250 };

        handler.preExecute({
            operations: [{ kind: "resize", id: "Participant_1", bounds }],
        });

        expect(modeling.resizeShape).toHaveBeenCalledWith(
            element("Participant_1"),
            bounds,
            undefined,
            RESIZE_HINTS,
        );
        expect(RESIZE_HINTS).toEqual({ layout: false, attachSupport: false });
    });

    it("suppresses adaptive label positioning on every waypoint update", () => {
        const { modeling, elementRegistry, element } = harness(["Flow_1"]);
        const handler = new LayoutApplyHandler(modeling, elementRegistry);
        const waypoints = [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
        ];

        handler.preExecute({ operations: [{ kind: "waypoints", id: "Flow_1", waypoints }] });

        expect(modeling.updateWaypoints).toHaveBeenCalledWith(
            element("Flow_1"),
            waypoints,
            WAYPOINT_HINTS,
        );
        expect(WAYPOINT_HINTS).toEqual({ createElementsBehavior: false });
    });

    it("never reaches for connection.layout — cropping would discard our waypoints", () => {
        const { modeling, elementRegistry } = harness(["Flow_1"]);
        const handler = new LayoutApplyHandler(modeling, elementRegistry);

        handler.preExecute({
            operations: [{ kind: "waypoints", id: "Flow_1", waypoints: [{ x: 0, y: 0 }] }],
        });

        expect(modeling).not.toHaveProperty("layoutConnection");
        expect(modeling.updateWaypoints).toHaveBeenCalledOnce();
    });

    it("walks the plan front to back so shapes settle before waypoints and labels", () => {
        const { modeling, elementRegistry } = harness([
            "Task_1",
            "Participant_1",
            "Flow_1",
            "Flow_1_label",
        ]);
        const handler = new LayoutApplyHandler(modeling, elementRegistry);
        const calls: string[] = [];
        modeling.moveShape.mockImplementation((element: { id: string }) =>
            calls.push(`move:${element.id}`),
        );
        modeling.resizeShape.mockImplementation((element: { id: string }) =>
            calls.push(`resize:${element.id}`),
        );
        modeling.updateWaypoints.mockImplementation((element: { id: string }) =>
            calls.push(`waypoints:${element.id}`),
        );

        const operations: LayoutOperation[] = [
            { kind: "move", id: "Task_1", delta: { x: 10, y: 0 } },
            { kind: "resize", id: "Participant_1", bounds: { x: 0, y: 0, width: 20, height: 20 } },
            { kind: "waypoints", id: "Flow_1", waypoints: [{ x: 0, y: 0 }] },
            { kind: "move-label", id: "Flow_1_label", delta: { x: 5, y: 0 } },
        ];
        handler.preExecute({ operations });

        expect(calls).toEqual([
            "move:Task_1",
            "resize:Participant_1",
            "waypoints:Flow_1",
            "move:Flow_1_label",
        ]);
    });

    it("moves a label without hints — it has nothing for them to suppress", () => {
        const { modeling, elementRegistry, element } = harness(["Event_1_label"]);
        const handler = new LayoutApplyHandler(modeling, elementRegistry);

        handler.preExecute({
            operations: [{ kind: "move-label", id: "Event_1_label", delta: { x: 8, y: 0 } }],
        });

        expect(modeling.moveShape).toHaveBeenCalledWith(element("Event_1_label"), { x: 8, y: 0 });
    });

    it("skips operations for elements the registry no longer knows", () => {
        const { modeling, elementRegistry } = harness([]);
        const handler = new LayoutApplyHandler(modeling, elementRegistry);

        handler.preExecute({
            operations: [{ kind: "move", id: "Ghost_1", delta: { x: 1, y: 1 } }],
        });

        expect(modeling.moveShape).not.toHaveBeenCalled();
    });

    it("has no execute or revert — the nested commands own all the state", () => {
        const handler = new LayoutApplyHandler(
            harness([]).modeling,
            harness([]).elementRegistry,
        ) as unknown as Record<string, unknown>;

        expect(handler.execute).toBeUndefined();
        expect(handler.revert).toBeUndefined();
    });
});
