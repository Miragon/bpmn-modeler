import { describe, expect, it } from "vitest";

import {
    box,
    lane,
    layoutOf,
    node,
    laneInPool,
    nodeInPoolLane,
    planeLanesWith,
    pool,
    poolOfLanes,
    poolWithLaneHolding,
} from "./__fixtures__/layoutShapes";
import { DrawingDraft } from "./layoutDrawingDraft";
import { FlowTopology } from "./layoutFlowTopology";
import type { LayoutModel, NodeShape } from "./layoutModel";
import {
    type RoomMade,
    freeRoom,
    makeRoom,
    makeRoomInLine,
    shiftedShapeCountOf,
} from "./layoutMakeRoom";
import type { RoomSlot } from "./layoutRoomSlots";
import { type ShapeGroup, ShapeGroups } from "./layoutShapeGroups";

describe("free rooms", () => {
    const draft = DrawingDraft.of(layoutOf([]));

    it("keep the draft with the shape moved there and shift and grow nothing", () => {
        expect(freeRoom(draft)).toStrictEqual({ draft, shifted: [], grown: [], growth: 0 });
    });
});

describe("shiftedShapeCountOf", () => {
    const bounds = box(0, 0);
    const draft = DrawingDraft.of(
        layoutOf([
            pool("Pool_2", bounds),
            lane("Lane_2", bounds, { pool: "Pool_1" }),
            node("Task_L", { pool: "Pool_1", lanes: ["Lane_2"], bounds }),
        ]),
    );

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
            node("Task_A", { bounds: box(500, 90), lanes: ["Lane_1"] }),
            node("Task_Y", { bounds: box(510, 90), lanes: ["Lane_1"] }),
            node("Task_L", { bounds: box(800, 200), lanes: ["Lane_2"] }),
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
                node("Task_O", { bounds: box(700, 90), lanes: ["Lane_1"] }),
                node("Task_A", { bounds: box(940, 90), lanes: ["Lane_1"] }),
                node("Task_B", { bounds: box(lastX, 90), lanes: ["Lane_1"] }),
                node("Task_Y", { bounds: box(300, 90), lanes: ["Lane_1"] }),
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

describe("makeRoomInLine", () => {
    const task = (id: string, x: number, y = 100) => node(id, { bounds: box(x, y) });

    /** The shapes as one group led by the first, as a chain moves. */
    const groupOf = (layout: LayoutModel, ids: readonly string[]): ShapeGroup => ({
        node: layout.shapes.get(ids[0]!) as NodeShape,
        members: ids,
        innerEdges: [],
        attachedEdges: [],
    });

    const roomIn = (
        layout: LayoutModel,
        line: number,
        ahead: readonly string[],
        behind?: readonly string[],
    ) => {
        const context = { groups: new ShapeGroups(layout), topology: new FlowTopology(layout) };
        return makeRoomInLine(
            DrawingDraft.of(layout),
            context,
            line,
            groupOf(layout, ahead),
            behind && groupOf(layout, behind),
        );
    };

    const xOf = (room: RoomMade | undefined, ids: readonly string[]) =>
        ids.map((id) => room?.draft.node(id)?.bounds.x);

    const AHEAD = ["Task_X1", "Task_X2"];
    const BEHIND = ["Task_Y1", "Task_Y2"];
    /** Task_Y1 and Task_Y2 drawn on Task_X1 and Task_X2, Task_B after them and Task_L on a lower row. */
    const twoChains = (yAt: number) =>
        layoutOf([
            task("Task_A", 100),
            task("Task_X1", 250),
            task("Task_X2", 400),
            task("Task_Y1", yAt),
            task("Task_Y2", yAt + 150),
            task("Task_B", 560),
            task("Task_L", 700, 300),
        ]);

    it("puts the group behind right of the group ahead, a room gap apart as it is drawn, and shifts everything at or past the line by one band", () => {
        const room = roomIn(twoChains(260), 250, AHEAD, BEHIND);

        expect(xOf(room, [...AHEAD, ...BEHIND])).toEqual([250, 400, 550, 700]);
        expect(xOf(room, ["Task_A", "Task_B", "Task_L"])).toEqual([100, 850, 990]);
        expect(room).toMatchObject({ shifted: ["Task_B", "Task_L"], grown: [], growth: 0 });
    });

    it("keeps a single group where it is drawn and shifts what it lies on, with everything at or past the line, behind it", () => {
        const layout = layoutOf([
            task("Task_A", 100),
            task("Task_Y1", 250),
            task("Task_Y2", 400),
            task("Task_B", 300),
            task("Task_C", 450),
        ]);

        const room = roomIn(layout, 250, BEHIND);

        expect(xOf(room, ["Task_A", ...BEHIND, "Task_B", "Task_C"])).toEqual([
            100, 250, 400, 550, 700,
        ]);
        expect(room?.shifted).toEqual(["Task_B", "Task_C"]);
    });

    it("grows the pool and lane that no longer hold what the band shifted", () => {
        const inLane = (id: string, x: number) => nodeInPoolLane(id, box(x, 100));
        const layout = poolWithLaneHolding([
            inLane("Task_A", 100),
            inLane("Task_Y1", 250),
            inLane("Task_Y2", 400),
            inLane("Task_B", 300),
            inLane("Task_D", 1000),
        ]);

        const room = roomIn(layout, 250, BEHIND);

        expect(xOf(room, ["Task_B", "Task_D"])).toEqual([550, 1250]);
        expect(room?.grown).toEqual(["Pool_1", "Lane_1"]);
        expect(room?.draft.shapes.get("Pool_1")?.bounds).toEqual(box(0, 0, 1400, 300));
    });

    it("puts the group behind past the border of its pool when nothing follows, and grows the pool and lane to hold it", () => {
        const inLane = (id: string, x: number) => nodeInPoolLane(id, box(x, 100));
        const layout = poolWithLaneHolding(
            [
                inLane("Task_A", 100),
                inLane("Task_X1", 250),
                inLane("Task_X2", 400),
                inLane("Task_Y1", 260),
                inLane("Task_Y2", 410),
            ],
            [],
            [poolOfLanes(box(0, 0, 700, 300)), laneInPool("Lane_1", box(30, 0, 670, 300))],
        );

        const room = roomIn(layout, 250, AHEAD, BEHIND);

        expect(xOf(room, [...AHEAD, ...BEHIND])).toEqual([250, 400, 550, 700]);
        expect(room).toMatchObject({ shifted: [], grown: ["Pool_1", "Lane_1"] });
        expect(room?.draft.shapes.get("Pool_1")?.bounds).toEqual(box(0, 0, 850, 300));
    });

    it.each([
        {
            when: "nothing at or past the line is in the way of a single group",
            layout: layoutOf([task("Task_A", 100), task("Task_Y1", 250), task("Task_Y2", 400)]),
            groups: [BEHIND] as const,
        },
        {
            when: "the group behind already lies behind the group ahead",
            layout: twoChains(600),
            groups: [AHEAD, BEHIND] as const,
        },
        {
            when: "a shape before the line lies where the leading shape of the group behind goes",
            layout: layoutOf([
                ...twoChains(260).shapes.values(),
                node("Note_Wide", { bounds: box(-300, 150, 900, 30) }),
            ]),
            groups: [AHEAD, BEHIND] as const,
        },
    ])("makes no room when $when", ({ layout, groups: [ahead, behind] }) => {
        expect(roomIn(layout, 250, ahead, behind)).toBeUndefined();
    });
});
