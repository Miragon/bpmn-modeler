import { describe, expect, it } from "vitest";

import { DrawingDraft } from "./layoutDrawingDraft";
import type { FlowRelation } from "./layoutFlowTopology";
import { type RoomMade, type RoomSlots, freeRoom, onlyMoves, slotsFor } from "./layoutMakeRoom";

describe("slotsFor", () => {
    it.each<[FlowRelation, boolean, RoomSlots]>([
        ["parallel", true, { stacked: true, inLine: ["after"] }],
        ["precedes", true, { stacked: false, inLine: ["before", "after"] }],
        ["follows", true, { stacked: false, inLine: ["after"] }],
        ["unrelated", true, { stacked: false, inLine: ["after"] }],
        ["parallel", false, { stacked: false, inLine: ["after"] }],
        ["precedes", false, { stacked: false, inLine: ["after"] }],
        ["follows", false, { stacked: false, inLine: ["after"] }],
        ["unrelated", false, { stacked: false, inLine: ["after"] }],
    ])(
        "draws a shape that %s the other, with flows running right %s, as %j",
        (relation, flowsRight, slots) => {
            expect(slotsFor(relation, flowsRight)).toEqual(slots);
        },
    );
});

describe("free rooms", () => {
    const draft = DrawingDraft.of({ shapes: new Map(), edges: new Map() });

    it("tells a room made at a free place as one that only moves the shape", () => {
        expect(onlyMoves(freeRoom(draft))).toBe(true);
        expect(freeRoom(draft).draft).toBe(draft);
    });

    it.each<[string, Pick<RoomMade, "shifted" | "grown">]>([
        ["shifted a shape", { shifted: ["Task_B"], grown: [] }],
        ["grew a frame", { shifted: [], grown: ["Sub_1"] }],
    ])("does not tell a room that %s as one that only moves the shape", (_, made) => {
        expect(onlyMoves({ ...freeRoom(draft), ...made, growth: made.grown.length * 20 })).toBe(
            false,
        );
    });
});
