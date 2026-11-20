import { describe, expect, it } from "vitest";

import { box, planeLanesWith, task } from "./__fixtures__/planeLanes";
import { rootPlane } from "./__fixtures__/shapePlane";
import { DrawingDraft } from "./layoutDrawingDraft";
import { FlowTopology } from "./layoutFlowTopology";
import type { LayoutModel, LayoutShape } from "./layoutModel";
import { type RoomMade, freeRoom, makeRoom, shiftedShapeCountOf } from "./layoutMakeRoom";
import type { RoomSlot } from "./layoutRoomSlots";
import { ShapeGroups } from "./layoutShapeGroups";

describe("free rooms", () => {
    const draft = DrawingDraft.of({ shapes: new Map(), edges: new Map() });

    it("keep the draft with the shape moved there and shift and grow nothing", () => {
        expect(freeRoom(draft)).toStrictEqual({ draft, shifted: [], grown: [], growth: 0 });
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

describe("makeRoom in a lane on a plane without a pool", () => {
    const roomFor = (layout: LayoutModel, moved: string, other: string, slot: RoomSlot) => {
        const draft = DrawingDraft.of(layout);
        const groups = new ShapeGroups(layout);
        return makeRoom(
            draft,
            { groups, topology: new FlowTopology(layout) },
            groups.of(draft, draft.node(moved)!),
            draft.node(other)!,
            slot,
        );
    };

    it("stacks the shape under the other as in a pool, the lane grown and the lane below shifted with what it holds", () => {
        const layout = planeLanesWith([
            task("Task_A", box(500, 90), "Lane_1"),
            task("Task_Y", box(510, 90), "Lane_1"),
            task("Task_L", box(800, 200), "Lane_2"),
        ]);

        const room = roomFor(layout, "Task_Y", "Task_A", "below");

        expect(room?.shifted).toEqual(["Lane_2", "Task_L"]);
        expect(room?.grown).toEqual(["Lane_1"]);
        expect(room?.draft.node("Task_Y")!.bounds).toEqual(box(500, 210));
        expect(room?.draft.shapes.get("Lane_1")!.bounds).toEqual(box(30, 70, 1170, 230));
        expect(room?.draft.shapes.get("Lane_2")!.bounds).toEqual(box(30, 300, 1170, 110));
        expect(room?.draft.node("Task_L")!.bounds).toEqual(box(800, 310));
    });

    it.each([
        [1060, 1230],
        [1080, 1230],
        [1100, 1240],
    ])(
        "places the shape after the other, the last shape at x %d shifted once and the lanes grown to %d wide to hold it",
        (lastX, laneWidth) => {
            const layout = planeLanesWith([
                task("Task_O", box(700, 90), "Lane_1"),
                task("Task_A", box(940, 90), "Lane_1"),
                task("Task_B", box(lastX, 90), "Lane_1"),
                task("Task_Y", box(300, 90), "Lane_1"),
            ]);

            const room = roomFor(layout, "Task_Y", "Task_O", "after");

            expect(room?.draft.node("Task_Y")!.bounds).toEqual(box(850, 90));
            expect(room?.shifted).toEqual(["Task_A", "Task_B"]);
            expect(room?.grown).toEqual(["Lane_1", "Lane_2"]);
            expect(room?.draft.node("Task_A")!.bounds).toEqual(box(1000, 90));
            expect(room?.draft.node("Task_B")!.bounds).toEqual(box(lastX + 60, 90));
            expect(room?.draft.shapes.get("Lane_1")!.bounds).toEqual(box(30, 70, laneWidth, 120));
        },
    );
});
