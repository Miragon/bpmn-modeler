import { describe, expect, it } from "vitest";

import { DrawingDraft } from "./layoutDrawingDraft";
import { type RoomMade, type RoomMadeBy, freeRoom, roomMadeBy } from "./layoutMakeRoom";

describe("free rooms", () => {
    const draft = DrawingDraft.of({ shapes: new Map(), edges: new Map() });

    it("tells a room made at a free place as one made by moving the shape alone", () => {
        expect(roomMadeBy(freeRoom(draft))).toBe("moving");
        expect(freeRoom(draft).draft).toBe(draft);
    });

    it.each<[Pick<RoomMade, "shifted" | "grown">, RoomMadeBy]>([
        [{ shifted: ["Task_B"], grown: [] }, "shifting"],
        [{ shifted: [], grown: ["Sub_1"] }, "growing"],
        [{ shifted: ["Task_B"], grown: ["Sub_1"] }, "growingAndShifting"],
    ])("tells a room with %o as one made by %s", (made, madeBy) => {
        expect(roomMadeBy({ ...freeRoom(draft), ...made, growth: made.grown.length * 20 })).toBe(
            madeBy,
        );
    });
});
