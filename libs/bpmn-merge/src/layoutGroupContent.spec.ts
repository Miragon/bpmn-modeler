import { describe, expect, it } from "vitest";

import { PLANE, layoutOf, node } from "./__fixtures__/layoutShapes";
import { rootPlane } from "./__fixtures__/shapePlane";
import type { Axis } from "./layoutAxis";
import { DrawingDraft } from "./layoutDrawingDraft";
import type { DiagramBounds } from "./layoutGeometry";
import { type EnclosedMove, GroupContent, groupAfterPush } from "./layoutGroupContent";
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
    it.each<[string, Axis, EnclosedMove[], DiagramBounds]>([
        [
            "shifts with what it encloses when all of it shifted by one amount",
            "x",
            [
                { from: TASK_A, to: box(150, 90) },
                { from: TASK_B, to: box(290, 90) },
            ],
            box(140, 80, 260, 100),
        ],
        [
            "shifts down with what it encloses along y",
            "y",
            [
                { from: TASK_A, to: box(100, 130) },
                { from: TASK_B, to: box(240, 130) },
            ],
            box(90, 120, 260, 100),
        ],
        [
            "grows at its far side by as far as the far side of what it encloses went when only some shifted",
            "x",
            [
                { from: TASK_A, to: TASK_A },
                { from: TASK_B, to: box(300, 90) },
            ],
            box(90, 80, 320, 100),
        ],
        [
            "stays when what shifted stays short of the far side of what it encloses",
            "x",
            [
                { from: TASK_A, to: box(120, 90) },
                { from: TASK_B, to: TASK_B },
            ],
            GROUP.bounds,
        ],
        [
            "grows when a shape it encloses grew instead of shifting",
            "x",
            [
                { from: TASK_A, to: TASK_A },
                { from: TASK_B, to: box(240, 90, 130, 80) },
            ],
            box(90, 80, 290, 100),
        ],
        [
            "stays when nothing it encloses moved",
            "x",
            [
                { from: TASK_A, to: TASK_A },
                { from: TASK_B, to: TASK_B },
            ],
            GROUP.bounds,
        ],
    ])("%s", (_, axis, enclosed, bounds) => {
        expect(groupAfterPush(GROUP, enclosed, axis).bounds).toEqual(bounds);
    });

    it.each<[string, EnclosedMove[], DiagramBounds]>([
        [
            "shifts a named group's label with it",
            [
                { from: TASK_A, to: box(150, 90) },
                { from: TASK_B, to: box(290, 90) },
            ],
            box(245, 84, 50, 14),
        ],
        [
            "keeps a named group's label at its top middle when it grows, as bpmn-js does",
            [
                { from: TASK_A, to: TASK_A },
                { from: TASK_B, to: box(300, 90) },
            ],
            box(225, 84, 50, 14),
        ],
    ])("%s", (_, enclosed, label) => {
        const named = { ...GROUP, label: box(195, 84, 50, 14) };

        expect(groupAfterPush(named, enclosed, "x").label).toEqual(label);
    });

    it("returns the group itself when it stays", () => {
        expect(groupAfterPush(GROUP, [{ from: TASK_A, to: TASK_A }], "x")).toBe(GROUP);
    });
});

describe("GroupContent", () => {
    const layout = layoutOf([
        GROUP,
        node("Task_A", { bounds: TASK_A }),
        node("Task_B", { bounds: TASK_B }),
        node("Task_Out", { bounds: box(300, 150) }),
    ]);

    const followAfter = (placed: readonly string[], shifted: readonly string[]) => {
        const before = DrawingDraft.of(layout);
        const trial = before.fork();
        const content = GroupContent.of(before, trial, PLANE, new Set(placed));
        for (const id of shifted) trial.replaceShape(translatedNode(trial.node(id)!, 50, 0));
        content.follow(trial, "x");
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
            "holds only the shapes it encloses, not one across its border",
            [],
            ["Task_A", "Task_B", "Task_Out"],
            box(140, 80, 260, 100),
        ],
        ["leaves out the shapes the room places", ["Task_A"], ["Task_B"], box(140, 80, 260, 100)],
        ["grows a group of which only some shapes shifted", [], ["Task_B"], box(90, 80, 310, 100)],
    ])("%s", (_, placed, shifted, bounds) => {
        expect(followAfter(placed, shifted)).toEqual(bounds);
    });

    it("grows by as far as an enclosed event's label went, so the label stays inside it", () => {
        const event = node("Event_1", {
            bounds: box(260, 120, 36, 36),
            label: box(250, 160, 56, 14),
        });
        const before = DrawingDraft.of(
            layoutOf([GROUP, node("Task_A", { bounds: TASK_A }), event]),
        );
        const trial = before.fork();
        const content = GroupContent.of(before, trial, PLANE, new Set());
        trial.replaceShape(translatedNode(trial.node("Event_1")!, 0, 40));

        content.follow(trial, "y");

        expect(trial.shapes.get("Group_1")!.bounds).toEqual(box(90, 80, 260, 140));
    });

    it.each<[string, string[], number]>([
        ["shifting", ["Task_A", "Task_B"], 50],
        ["growing", ["Task_B"], 50],
    ])("stays as drawn when %s would take in a shape it did not enclose", (_, shifted, by) => {
        const stranger = node("Data_1", { bounds: box(360, 100, 36, 36) });
        const before = DrawingDraft.of(
            layoutOf([
                GROUP,
                node("Task_A", { bounds: TASK_A }),
                node("Task_B", { bounds: TASK_B }),
                stranger,
            ]),
        );
        const trial = before.fork();
        const content = GroupContent.of(before, trial, PLANE, new Set());
        for (const id of shifted) {
            trial.replaceShape(translatedNode(trial.node(id)!, by, 0));
        }

        content.follow(trial, "x");

        expect(trial.shapes.get("Group_1")).toBe(GROUP);
    });

    it("follows when what it would take in lies within it as drawn too", () => {
        const before = DrawingDraft.of(
            layoutOf([
                GROUP,
                node("Task_A", { bounds: TASK_A }),
                node("Task_B", { bounds: TASK_B }),
                node("Data_1", { bounds: box(360, 100, 36, 36) }),
            ]),
        );
        const trial = before.fork();
        const content = GroupContent.of(before, trial, PLANE, new Set());
        trial.replaceShape(translatedNode(trial.node("Data_1")!, -100, 0));
        for (const id of ["Task_A", "Task_B"]) {
            trial.replaceShape(translatedNode(trial.node(id)!, 50, 0));
        }

        content.follow(trial, "x");

        expect(trial.shapes.get("Group_1")!.bounds).toEqual(box(140, 80, 260, 100));
    });

    it("leaves a group on another plane as drawn", () => {
        const elsewhere = group(GROUP.bounds, "Process_2");
        const before = DrawingDraft.of(layoutOf([elsewhere, node("Task_A", { bounds: TASK_A })]));
        const trial = before.fork();
        const content = GroupContent.of(before, trial, PLANE, new Set());
        trial.replaceShape(translatedNode(trial.node("Task_A")!, 50, 0));

        content.follow(trial, "x");

        expect(trial.shapes.get("Group_1")).toBe(elsewhere);
    });
});
