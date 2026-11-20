import { describe, expect, it } from "vitest";

import { PLANE, layoutOf, node } from "./__fixtures__/layoutShapes";
import { rootPlane } from "./__fixtures__/shapePlane";
import type { Axis } from "./layoutAxis";
import { DrawingDraft } from "./layoutDrawingDraft";
import type { DiagramBounds } from "./layoutGeometry";
import { type FramedMove, GroupFraming, groupAfterPush } from "./layoutGroupFraming";
import { type GroupShape, translatedNode } from "./layoutModel";

const box = (x: number, y: number, width = 100, height = 80): DiagramBounds => ({
    x,
    y,
    width,
    height,
});

const group = (bounds: DiagramBounds, plane = PLANE): GroupShape => ({
    kind: "group",
    id: "Group_1",
    ...rootPlane(plane),
    outline: "rectangle",
    bounds,
});

const GROUP = group(box(90, 80, 260, 100));
const TASK_A = box(100, 90);
const TASK_B = box(240, 90);

describe("groupAfterPush", () => {
    it.each<[string, Axis, FramedMove[], DiagramBounds]>([
        [
            "shifts with what it frames when all of it shifted by one amount",
            "x",
            [
                { from: TASK_A, to: box(150, 90) },
                { from: TASK_B, to: box(290, 90) },
            ],
            box(140, 80, 260, 100),
        ],
        [
            "shifts down with what it frames along y",
            "y",
            [
                { from: TASK_A, to: box(100, 130) },
                { from: TASK_B, to: box(240, 130) },
            ],
            box(90, 120, 260, 100),
        ],
        [
            "grows at its far side by as far as the far side of what it frames went when only some shifted",
            "x",
            [
                { from: TASK_A, to: TASK_A },
                { from: TASK_B, to: box(300, 90) },
            ],
            box(90, 80, 320, 100),
        ],
        [
            "stays when what shifted stays short of the far side of what it frames",
            "x",
            [
                { from: TASK_A, to: box(120, 90) },
                { from: TASK_B, to: TASK_B },
            ],
            GROUP.bounds,
        ],
        [
            "grows when a shape it frames grew instead of shifting",
            "x",
            [
                { from: TASK_A, to: TASK_A },
                { from: TASK_B, to: box(240, 90, 130, 80) },
            ],
            box(90, 80, 290, 100),
        ],
        [
            "stays when nothing it frames moved",
            "x",
            [
                { from: TASK_A, to: TASK_A },
                { from: TASK_B, to: TASK_B },
            ],
            GROUP.bounds,
        ],
    ])("%s", (_, axis, framed, bounds) => {
        expect(groupAfterPush(GROUP, framed, axis).bounds).toEqual(bounds);
    });

    it("returns the group itself when it stays", () => {
        expect(groupAfterPush(GROUP, [{ from: TASK_A, to: TASK_A }], "x")).toBe(GROUP);
    });
});

describe("GroupFraming", () => {
    const layout = layoutOf([
        GROUP,
        node("Task_A", { bounds: TASK_A }),
        node("Task_B", { bounds: TASK_B }),
        node("Task_Out", { bounds: box(300, 90) }),
    ]);

    const followAfter = (placed: readonly string[], shifted: readonly string[]) => {
        const before = DrawingDraft.of(layout);
        const trial = before.fork();
        const framing = GroupFraming.of(before, trial, PLANE, new Set(placed));
        for (const id of shifted) trial.replaceShape(translatedNode(trial.node(id)!, 50, 0));
        framing.follow(trial, "x");
        return trial.shapes.get("Group_1")!.bounds;
    };

    it.each<[string, string[], string[], DiagramBounds]>([
        [
            "shifts a group whose enclosed shapes all shifted",
            [],
            ["Task_A", "Task_B"],
            box(140, 80, 260, 100),
        ],
        [
            "frames only the shapes it encloses, not one across its border",
            [],
            ["Task_A", "Task_B", "Task_Out"],
            box(140, 80, 260, 100),
        ],
        ["leaves out the shapes the room places", ["Task_A"], ["Task_B"], box(140, 80, 260, 100)],
        ["grows a group of which only some shapes shifted", [], ["Task_B"], box(90, 80, 310, 100)],
    ])("%s", (_, placed, shifted, bounds) => {
        expect(followAfter(placed, shifted)).toEqual(bounds);
    });

    it("leaves a group on another plane as drawn", () => {
        const elsewhere = group(GROUP.bounds, "Process_2");
        const before = DrawingDraft.of(layoutOf([elsewhere, node("Task_A", { bounds: TASK_A })]));
        const trial = before.fork();
        const framing = GroupFraming.of(before, trial, PLANE, new Set());
        trial.replaceShape(translatedNode(trial.node("Task_A")!, 50, 0));

        framing.follow(trial, "x");

        expect(trial.shapes.get("Group_1")).toBe(elsewhere);
    });
});
