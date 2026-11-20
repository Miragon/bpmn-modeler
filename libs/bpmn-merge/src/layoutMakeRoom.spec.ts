import { describe, expect, it } from "vitest";

import { DrawingDraft } from "./layoutDrawingDraft";
import { freeRoom } from "./layoutMakeRoom";

describe("free rooms", () => {
    const draft = DrawingDraft.of({ shapes: new Map(), edges: new Map() });

    it("keep the draft with the shape moved there and shift and grow nothing", () => {
        expect(freeRoom(draft)).toStrictEqual({ draft, shifted: [], grown: [], growth: 0 });
    });
});
