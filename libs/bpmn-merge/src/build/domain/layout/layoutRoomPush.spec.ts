import { describe, expect, it } from "vitest";

import { box, layoutOf, node, planeLanesWith } from "../../../__fixtures__/layoutShapes";
import { DrawingDraft } from "./layoutDrawingDraft";
import { FlowTopology } from "./layoutFlowTopology";
import { RoomPush } from "./layoutRoomPush";
import { ShapeGroups, groupBoundsIn } from "./layoutShapeGroups";

describe("RoomPush below a shape in a lane on a plane without a pool", () => {
    const layout = planeLanesWith([
        node("Task_A", { bounds: box(500, 90), lanes: ["Lane_1"] }),
        node("Task_Y", { bounds: box(510, 90), lanes: ["Lane_1"] }),
        node("Task_L", { bounds: box(800, 200), lanes: ["Lane_2"] }),
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
        node("Task_A", { bounds: box(1000, 90), lanes: ["Lane_1"] }),
        node("Task_L", { bounds: box(800, 200), lanes: ["Lane_2"] }),
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

describe("RoomPush opening a band", () => {
    const task = (id: string, x: number, y = 100) => node(id, { bounds: box(x, y) });
    /** Task_N and Task_M are placed; Task_On lies on Task_N, the others lie on neither. */
    const placed = [task("Task_N", 250), task("Task_M", 400)];
    const others = [
        task("Task_Before", 100),
        task("Task_On", 300),
        task("Task_Below", 320, 300),
        task("Task_Far", 900),
    ];

    const pushIn = (nodes: typeof others, band: boolean) => {
        const layout = layoutOf([...placed, ...nodes]);
        const draft = DrawingDraft.of(layout);
        const trial = draft.fork();
        const push = new RoomPush(
            draft,
            trial,
            new ShapeGroups(layout),
            new FlowTopology(layout),
            "x",
        );
        const made = push.push(trial.node("Task_N")!, {
            box: placed[0]!.bounds,
            column: [placed[1]!.bounds],
            line: 250,
            exclude: new Set(["Task_N", "Task_M"]),
            band,
        });
        return { made, push, xOf: (id: string) => trial.node(id)!.bounds.x };
    };

    it("shifts everything at or past the line by one shift that clears the box and the column, once something there is in the way", () => {
        const { made, push, xOf } = pushIn(others, true);

        expect(made).toBe(true);
        expect(push.shifted).toEqual(["Task_On", "Task_Below", "Task_Far"]);
        expect(["Task_On", "Task_Below", "Task_Far"].map(xOf)).toEqual([550, 570, 1150]);
        expect(xOf("Task_Before")).toBe(100);
    });

    it("shifts far enough that nothing it shifts comes to lie on the box or the column", () => {
        const lowerRow = [task("Task_M2", 400, 300), task("Task_Low", 200, 300)];
        const layout = layoutOf([...placed, lowerRow[0]!, task("Task_On", 300), lowerRow[1]!]);
        const draft = DrawingDraft.of(layout);
        const trial = draft.fork();
        const push = new RoomPush(
            draft,
            trial,
            new ShapeGroups(layout),
            new FlowTopology(layout),
            "x",
        );

        push.push(trial.node("Task_N")!, {
            box: placed[0]!.bounds,
            column: [placed[1]!.bounds, lowerRow[0]!.bounds],
            line: 250,
            exclude: new Set(["Task_N", "Task_M", "Task_M2"]),
            band: true,
        });

        expect(trial.node("Task_On")!.bounds.x).toBe(650);
        expect(trial.node("Task_Low")!.bounds.x).toBe(550);
    });

    it("shifts nothing when nothing at or past the line is in the way", () => {
        const { made, push, xOf } = pushIn(
            others.filter(({ id }) => id !== "Task_On"),
            true,
        );

        expect(made).toBe(true);
        expect(push.shifted).toEqual([]);
        expect(xOf("Task_Below")).toBe(320);
    });

    it("shifts only what is in the way, past what it lies on, without a band", () => {
        const { push, xOf } = pushIn(others, false);

        expect(push.shifted).toEqual(["Task_On"]);
        expect(xOf("Task_On")).toBe(400);
        expect(xOf("Task_Below")).toBe(320);
    });
});
