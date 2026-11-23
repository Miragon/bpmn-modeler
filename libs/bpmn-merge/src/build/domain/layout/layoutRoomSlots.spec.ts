import { describe, expect, it } from "vitest";

import { layoutOf, node } from "../../../__fixtures__/layoutShapes";
import type { FlowRelation } from "./layoutFlowTopology";
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
    const host = node("Task_H");
    const timer = node("Timer_1", { host: "Task_H" });
    const layout = layoutOf([host, timer]);

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
