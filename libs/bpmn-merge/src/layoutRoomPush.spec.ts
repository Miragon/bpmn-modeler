import { describe, expect, it } from "vitest";

import { rootPlane } from "./__fixtures__/shapePlane";
import { DrawingDraft } from "./layoutDrawingDraft";
import { FlowTopology } from "./layoutFlowTopology";
import type { DiagramBounds } from "./layoutGeometry";
import type { LaneShape, LayoutModel, NodeShape } from "./layoutModel";
import { RoomPush } from "./layoutRoomPush";
import { ShapeGroups, groupBoundsIn } from "./layoutShapeGroups";

const PLANE = "Process_1";

const box = (x: number, y: number, width = 100, height = 80): DiagramBounds => ({
    x,
    y,
    width,
    height,
});

const lane = (id: string, bounds: DiagramBounds): LaneShape => ({
    kind: "lane",
    id,
    ...rootPlane(PLANE),
    parent: PLANE,
    outline: "rectangle",
    bounds,
});

const task = (id: string, bounds: DiagramBounds, inLane: string): NodeShape => ({
    kind: "node",
    id,
    ...rootPlane(PLANE),
    lanes: [inLane],
    subProcesses: [],
    expanded: false,
    mayLieOutsidePool: false,
    outline: "rectangle",
    bounds,
});

describe("RoomPush below a shape in a lane on a plane without a pool", () => {
    const layout: LayoutModel = {
        shapes: new Map(
            [
                lane("Lane_1", box(30, 70, 1170, 120)),
                lane("Lane_2", box(30, 190, 1170, 110)),
                task("Task_A", box(500, 90), "Lane_1"),
                task("Task_Y", box(510, 90), "Lane_1"),
                task("Task_L", box(800, 200), "Lane_2"),
            ].map((shape) => [shape.id, shape]),
        ),
        edges: new Map(),
    };

    it("grows the lane, shifts the lane below with what it holds, then shifts what that lane holds again by the strip the lanes gain", () => {
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
        expect(trial.node("Task_L")!.bounds).toEqual(box(800, 420));
    });
});
