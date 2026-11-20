import { describe, expect, it } from "vitest";

import { box, node, planeLanesWith } from "./__fixtures__/layoutShapes";
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
