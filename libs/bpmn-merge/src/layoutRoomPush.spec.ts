import { describe, expect, it } from "vitest";

import { box, lane, planeLanesWith, task } from "./__fixtures__/planeLanes";
import { rootPlane } from "./__fixtures__/shapePlane";
import type { Axis } from "./layoutAxis";
import { DrawingDraft } from "./layoutDrawingDraft";
import { FlowTopology } from "./layoutFlowTopology";
import type { FrameScope } from "./layoutFrames";
import type { LaneShape, NodeShape, PoolShape } from "./layoutModel";
import { type GrowingFrame, RoomPush, growingFrameOf } from "./layoutRoomPush";
import { ShapeGroups, groupBoundsIn } from "./layoutShapeGroups";

describe("growingFrameOf", () => {
    const pool: PoolShape = {
        kind: "pool",
        id: "Pool_1",
        ...rootPlane("Collaboration_1"),
        outline: "rectangle",
        bounds: box(0, 0, 1200, 300),
    };
    const laneInPool: LaneShape = { ...lane("Lane_1", box(30, 0, 1170, 300)), pool: "Pool_1" };
    const planeLane = lane("Lane_1", box(30, 0, 1170, 300));
    const subProcess: NodeShape = {
        ...task("Sub_1", box(100, 50, 300, 200), "Lane_1"),
        expanded: true,
    };

    it.each<[string, FrameScope, Axis, GrowingFrame]>([
        [
            "a sub-process along x",
            { container: subProcess, lane: undefined },
            "x",
            { kind: "subProcess", subProcess },
        ],
        [
            "a sub-process along y",
            { container: subProcess, lane: undefined },
            "y",
            { kind: "subProcess", subProcess },
        ],
        [
            "a lane of a pool down",
            { container: pool, lane: laneInPool },
            "y",
            { kind: "laneDown", lane: laneInPool, pool, keepsPoolsLevel: true },
        ],
        [
            "a lane on a plane without a pool down",
            { container: undefined, lane: planeLane },
            "y",
            { kind: "laneDown", lane: planeLane, pool: undefined, keepsPoolsLevel: false },
        ],
        [
            "the pool, not the lane, along x",
            { container: pool, lane: laneInPool },
            "x",
            { kind: "pool", pool, keepsPoolsLevel: false },
        ],
        [
            "a pool without lanes down, which the pools level with it follow",
            { container: pool, lane: undefined },
            "y",
            { kind: "pool", pool, keepsPoolsLevel: true },
        ],
        [
            "the lanes of a plane without a pool along x",
            { container: undefined, lane: planeLane },
            "x",
            { kind: "planeLanes", lane: planeLane },
        ],
        [
            "nothing on a plane outside lanes",
            { container: undefined, lane: undefined },
            "y",
            { kind: "plane" },
        ],
    ])("grows %s", (_, scope, axis, frame) => {
        expect(growingFrameOf(scope, axis)).toEqual(frame);
    });
});

describe("RoomPush below a shape in a lane on a plane without a pool", () => {
    const layout = planeLanesWith([
        task("Task_A", box(500, 90), "Lane_1"),
        task("Task_Y", box(510, 90), "Lane_1"),
        task("Task_L", box(800, 200), "Lane_2"),
    ]);

    it("grows the lane and shifts the lane below with what it holds once, by the growth", () => {
        const draft = DrawingDraft.of(layout);
        const groups = new ShapeGroups(layout);
        const group = groups.of(draft, draft.node("Task_Y")!);
        const trial = draft.fork();
        trial.translate(group, -10, 120);
        const push = new RoomPush(draft, trial, groups, new FlowTopology(layout), "y");

        const made = push.push(trial.node("Task_Y")!, {
            box: groupBoundsIn(trial, group),
            line: 171,
            exclude: new Set(group.members),
            stays: new Set(["Task_A"]),
        });

        expect(made).toBe(true);
        expect(push.shifted).toEqual(["Lane_2", "Task_L"]);
        expect(trial.shapes.get("Lane_1")!.bounds).toEqual(box(30, 70, 1170, 230));
        expect(trial.shapes.get("Lane_2")!.bounds).toEqual(box(30, 300, 1170, 110));
        expect(trial.node("Task_L")!.bounds).toEqual(box(800, 310));
    });
});

describe("RoomPush along x in a lane on a plane without a pool", () => {
    const layout = planeLanesWith([
        task("Task_A", box(1000, 90), "Lane_1"),
        task("Task_L", box(800, 200), "Lane_2"),
    ]);

    it.each([
        ["its center then past the lanes' far side", 1020, 1170, 1290],
        ["its center then short of the lanes' far side", 980, 1130, 1250],
    ])(
        "shifts what the box lands on once, %s, and grows the lanes to hold it",
        (_, boxX, shiftedX, laneWidth) => {
            const draft = DrawingDraft.of(layout);
            const trial = draft.fork();
            const push = new RoomPush(
                draft,
                trial,
                new ShapeGroups(layout),
                new FlowTopology(layout),
                "x",
            );

            const made = push.push(trial.node("Task_A")!, {
                box: box(boxX, 90),
                line: 900,
                exclude: new Set(),
            });

            expect(made).toBe(true);
            expect(push.shifted).toEqual(["Task_A"]);
            expect(trial.node("Task_A")!.bounds).toEqual(box(shiftedX, 90));
            expect(trial.shapes.get("Lane_1")!.bounds).toEqual(box(30, 70, laneWidth, 120));
            expect(trial.shapes.get("Lane_2")!.bounds).toEqual(box(30, 190, laneWidth, 110));
            expect(trial.node("Task_L")!.bounds).toEqual(box(800, 200));
        },
    );
});
