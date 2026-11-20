import { describe, expect, it } from "vitest";

import { rootPlane } from "./__fixtures__/shapePlane";
import type { FlowRelation } from "./layoutFlowTopology";
import type { LayoutModel, NodeShape } from "./layoutModel";
import { type RoomSlot, type RoomSlots, slotShapeOf, slotsFor } from "./layoutRoomSlots";

describe("slotsFor", () => {
    it.each<[FlowRelation, boolean, RoomSlots]>([
        ["parallel", true, { stacked: true, inLine: ["after"], otherwise: ["before"] }],
        ["precedes", true, { stacked: false, inLine: ["before", "after"], otherwise: ["below"] }],
        ["follows", true, { stacked: false, inLine: ["after"], otherwise: ["before", "below"] }],
        ["unrelated", true, { stacked: false, inLine: ["after"], otherwise: ["before", "below"] }],
        ["parallel", false, { stacked: false, inLine: ["after"], otherwise: ["before", "below"] }],
        ["precedes", false, { stacked: false, inLine: ["after"], otherwise: ["before", "below"] }],
        ["follows", false, { stacked: false, inLine: ["after"], otherwise: ["before", "below"] }],
        ["unrelated", false, { stacked: false, inLine: ["after"], otherwise: ["before", "below"] }],
    ])(
        "draws a shape that %s the other, with flows running right %s, as %j",
        (relation, flowsRight, slots) => {
            expect(slotsFor(relation, flowsRight)).toEqual(slots);
        },
    );
});

describe("slotShapeOf", () => {
    function node(id: string, relations: Partial<NodeShape> = {}): NodeShape {
        return {
            kind: "node",
            id,
            ...rootPlane("Collaboration_1"),
            bounds: { x: 0, y: 0, width: 100, height: 80 },
            outline: "rectangle",
            expanded: false,
            subProcesses: [],
            lanes: [],
            mayLieOutsidePool: false,
            ...relations,
        };
    }
    const host = node("Task_H");
    const timer = node("Timer_1", { host: "Task_H" });
    const layout: LayoutModel = {
        shapes: new Map([host, timer].map((shape) => [shape.id, shape])),
        edges: new Map(),
    };

    it("stacks below the host of a boundary event, as the event lies on its edge", () => {
        expect(slotShapeOf(layout, timer, "below")).toBe(host);
    });

    it.each<RoomSlot>(["after", "before"])("lines up %s the boundary event itself", (slot) => {
        expect(slotShapeOf(layout, timer, slot)).toBe(timer);
    });

    it("stacks below a shape on no host", () => {
        expect(slotShapeOf(layout, host, "below")).toBe(host);
    });
});
