import { describe, expect, it } from "vitest";

import { DrawingDraft } from "./layoutDrawingDraft";
import { type RoomMade, freeRoom, onlyMoves } from "./layoutMakeRoom";

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
