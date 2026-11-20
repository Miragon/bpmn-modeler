import { describe, expect, it } from "vitest";

import { rootPlane } from "./__fixtures__/shapePlane";
import { DrawingDraft } from "./layoutDrawingDraft";
import type { LayoutShape } from "./layoutModel";
import { type RoomMade, freeRoom, onlyMoves, shiftedShapeCountOf } from "./layoutMakeRoom";

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

describe("shiftedShapeCountOf", () => {
    const bounds = { x: 0, y: 0, width: 100, height: 80 };
    const shapes: LayoutShape[] = [
        {
            kind: "pool",
            id: "Pool_2",
            ...rootPlane("Collaboration_1"),
            outline: "rectangle",
            bounds,
        },
        {
            kind: "lane",
            id: "Lane_2",
            ...rootPlane("Collaboration_1"),
            parent: "Process_1",
            pool: "Pool_1",
            outline: "rectangle",
            bounds,
        },
        {
            kind: "node",
            id: "Task_L",
            ...rootPlane("Collaboration_1"),
            pool: "Pool_1",
            lanes: ["Lane_2"],
            subProcesses: [],
            expanded: false,
            mayLieOutsidePool: false,
            outline: "rectangle",
            bounds,
        },
    ];
    const draft = DrawingDraft.of({
        shapes: new Map(shapes.map((shape) => [shape.id, shape])),
        edges: new Map(),
    });

    it("counts the nodes and pools that gave way but not the lanes shifted below a grown lane, whose growth weighs them", () => {
        const room: RoomMade = {
            draft,
            shifted: ["Pool_2", "Lane_2", "Task_L"],
            grown: ["Pool_1", "Lane_1"],
            growth: 120,
        };

        expect(shiftedShapeCountOf(room)).toBe(2);
    });
});
