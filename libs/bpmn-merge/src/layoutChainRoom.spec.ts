import { describe, expect, it } from "vitest";

import { box, flow, layoutOf, node } from "./__fixtures__/layoutShapes";
import {
    type ChainRoomAttempt,
    chainBeforeWhatItLeadsInto,
    twoChainsInLine,
} from "./layoutChainRoom";
import { DrawingDraft } from "./layoutDrawingDraft";
import { FlowTopology } from "./layoutFlowTopology";
import type { LayoutEdge, LayoutModel, NodeShape } from "./layoutModel";
import { ShapeGroups } from "./layoutShapeGroups";

const task = (id: string, x: number, y = 100) => node(id, { bounds: box(x, y) });

const TASK_A = task("Task_A", 100);
/** Current's two tasks after Task_A, and incoming's two drawn on them. */
const X = [task("Task_X1", 250), task("Task_X2", 400)];
const Y = [task("Task_Y1", 260), task("Task_Y2", 410)];

const INTO_X = flow("Flow_AX", "Task_A", "Task_X1");
const INTO_Y = flow("Flow_AY", "Task_A", "Task_Y1");
const X_FLOWS = [flow("Flow_X", "Task_X1", "Task_X2"), flow("Flow_XB", "Task_X2", "Task_B")];
const Y_FLOWS = [flow("Flow_Y", "Task_Y1", "Task_Y2"), flow("Flow_YB", "Task_Y2", "Task_B")];

const sideWith = (chain: readonly NodeShape[], flows: readonly LayoutEdge[], bAt = 560) =>
    layoutOf([TASK_A, ...chain, task("Task_B", bAt)], flows);

const CURRENT = sideWith(X, [INTO_X, ...X_FLOWS]);
const INCOMING = sideWith(Y, [INTO_Y, ...Y_FLOWS]);

/** Both chains where their sides drew them and Task_B behind them, with the flows the result kept. */
const resultWith = (...kept: readonly LayoutEdge[]) =>
    layoutOf([TASK_A, ...X, ...Y, task("Task_B", 560)], kept);

function roomFor(
    attempt: ChainRoomAttempt,
    result: LayoutModel,
    [first, second]: readonly [string, string],
    sides: readonly LayoutModel[] = [CURRENT, INCOMING],
) {
    const draft = DrawingDraft.of(result);
    const context = { groups: new ShapeGroups(result), topology: new FlowTopology(result), sides };
    return attempt(draft, context, [draft.node(first)!, draft.node(second)!]);
}

const xOf = (room: ReturnType<typeof roomFor>, ids: readonly string[]) =>
    ids.map((id) => room?.draft.node(id)?.bounds.x);

const SHAPES = ["Task_X1", "Task_X2", "Task_Y1", "Task_Y2", "Task_B"];

describe("room for chains of shapes one side added", () => {
    it.each([
        {
            enters: "a flow enters current's chain only",
            result: resultWith(INTO_X, ...X_FLOWS, ...Y_FLOWS),
            x: [250, 400, 550, 700, 850],
            placed: "Task_Y2",
        },
        {
            enters: "a flow enters incoming's chain only",
            result: resultWith(INTO_Y, ...X_FLOWS, ...Y_FLOWS),
            x: [560, 710, 260, 410, 860],
            placed: "Task_X2",
        },
        {
            enters: "a flow enters current's single step only",
            result: layoutOf(
                [TASK_A, X[0]!, ...Y, task("Task_B", 560)],
                [INTO_X, flow("Flow_XB", "Task_X1", "Task_B"), ...Y_FLOWS],
            ),
            sides: [sideWith([X[0]!], [INTO_X, flow("Flow_XB", "Task_X1", "Task_B")]), INCOMING],
            pair: ["Task_X1", "Task_Y1"] as const,
            x: [250, undefined, 400, 550, 700],
            placed: "Task_Y1",
        },
        {
            enters: "a flow leads from current's chain into incoming's",
            result: resultWith(
                INTO_X,
                X_FLOWS[0]!,
                flow("Flow_XB", "Task_X2", "Task_Y1"),
                ...Y_FLOWS,
            ),
            pair: ["Task_X2", "Task_Y1"] as const,
            x: [250, 400, 550, 700, 850],
            placed: "Task_Y1",
        },
    ])(
        "puts two chains that lie on each other one after the other, each as drawn, when $enters",
        ({ result, x, placed, pair = ["Task_X2", "Task_Y2"] as const, sides }) => {
            const room = roomFor(twoChainsInLine, result, pair, sides);

            expect(roomFor(chainBeforeWhatItLeadsInto, result, pair, sides)).toBeUndefined();

            expect(xOf(room, SHAPES)).toEqual(x);
            expect(room?.named).toBe(placed);
            expect(room?.shifted).toEqual(["Task_B"]);
        },
    );

    it.each([
        { lies: "behind the chain's first shape", bAt: 300 },
        { lies: "with its middle before the chain's first shape", bAt: 200 },
    ])(
        "keeps a chain where it is drawn and shifts the shape it leads into behind it, when that lies $lies",
        ({ bAt }) => {
            const current = layoutOf([TASK_A, task("Task_B", bAt)]);
            const result = layoutOf([TASK_A, ...Y, task("Task_B", bAt)], [INTO_Y, ...Y_FLOWS]);

            const sides = [current, INCOMING];
            const room = roomFor(chainBeforeWhatItLeadsInto, result, ["Task_Y1", "Task_B"], sides);

            expect(roomFor(twoChainsInLine, result, ["Task_Y1", "Task_B"], sides)).toBeUndefined();

            expect(xOf(room, ["Task_A", "Task_Y1", "Task_Y2", "Task_B"])).toEqual([
                100, 260, 410, 560,
            ]);
            expect(room?.named).toBe("Task_Y1");
            expect(room?.shifted).toEqual(["Task_B"]);
        },
    );

    it("names the room after the host of a boundary event that lies on the shape the chain leads into", () => {
        const onFirst = node("Boundary_Y", { bounds: box(332, 162, 36, 36), host: "Task_Y1" });
        const current = layoutOf([TASK_A, task("Task_B", 340, 150)]);
        const incoming = layoutOf(
            [TASK_A, ...Y, onFirst, task("Task_B", 560, 150)],
            [INTO_Y, ...Y_FLOWS],
        );
        const result = layoutOf(
            [TASK_A, ...Y, onFirst, task("Task_B", 340, 150)],
            [INTO_Y, ...Y_FLOWS],
        );

        const room = roomFor(
            chainBeforeWhatItLeadsInto,
            result,
            ["Boundary_Y", "Task_B"],
            [current, incoming],
        );

        expect(room?.named).toBe("Task_Y1");
        expect(room?.shifted).toEqual(["Task_B"]);
    });

    it.each([
        {
            leaves: "two single steps, which are stacked or put in line as shapes",
            result: layoutOf(
                [TASK_A, X[0]!, Y[0]!, task("Task_B", 420)],
                [
                    INTO_X,
                    flow("Flow_XB", "Task_X1", "Task_B"),
                    flow("Flow_YB", "Task_Y1", "Task_B"),
                ],
            ),
            sides: [
                sideWith([X[0]!], [INTO_X, flow("Flow_XB", "Task_X1", "Task_B")], 420),
                sideWith([Y[0]!], [INTO_Y, flow("Flow_YB", "Task_Y1", "Task_B")], 420),
            ],
            pair: ["Task_X1", "Task_Y1"] as const,
        },
        {
            leaves: "two chains a flow enters each, as two branches",
            result: resultWith(INTO_X, INTO_Y, ...X_FLOWS, ...Y_FLOWS),
            sides: [CURRENT, INCOMING],
            pair: ["Task_X1", "Task_Y1"] as const,
        },
        {
            leaves: "two shapes of one side's chain",
            result: layoutOf(
                [TASK_A, X[0]!, task("Task_X2", 260), task("Task_B", 560)],
                [INTO_X, ...X_FLOWS],
            ),
            sides: [
                layoutOf(
                    [TASK_A, X[0]!, task("Task_X2", 260), task("Task_B", 560)],
                    [INTO_X, ...X_FLOWS],
                ),
                layoutOf([TASK_A, task("Task_B", 560)]),
            ],
            pair: ["Task_X1", "Task_X2"] as const,
        },
        {
            leaves: "two shapes both sides draw",
            result: layoutOf([TASK_A, task("Task_B", 110)]),
            sides: [
                layoutOf([TASK_A, task("Task_B", 560)]),
                layoutOf([TASK_A, task("Task_B", 110)]),
            ],
            pair: ["Task_A", "Task_B"] as const,
        },
        {
            leaves: "a chain on a shape it does not lead into",
            result: layoutOf(
                [TASK_A, ...Y, task("Task_B", 560), task("Task_K", 300)],
                [INTO_Y, ...Y_FLOWS],
            ),
            sides: [
                layoutOf([TASK_A, task("Task_B", 560), task("Task_K", 300)]),
                layoutOf(
                    [TASK_A, ...Y, task("Task_B", 560), task("Task_K", 900)],
                    [INTO_Y, ...Y_FLOWS],
                ),
            ],
            pair: ["Task_Y1", "Task_K"] as const,
        },
        {
            leaves: "a chain on a shape the other side added that no sequence flow joins",
            result: layoutOf(
                [TASK_A, ...Y, task("Task_B", 560), task("Task_K", 300)],
                [INTO_Y, ...Y_FLOWS],
            ),
            sides: [layoutOf([TASK_A, task("Task_B", 560), task("Task_K", 300)]), INCOMING],
            pair: ["Task_Y1", "Task_K"] as const,
        },
        {
            leaves: "chains drawn top to bottom, as room is made only to the right",
            result: layoutOf(
                [
                    TASK_A,
                    task("Task_X1", 100, 250),
                    task("Task_X2", 100, 400),
                    task("Task_Y1", 110, 260),
                    task("Task_Y2", 110, 410),
                    task("Task_B", 100, 560),
                ],
                [INTO_X, ...X_FLOWS, ...Y_FLOWS],
            ),
            sides: [
                layoutOf(
                    [
                        TASK_A,
                        task("Task_X1", 100, 250),
                        task("Task_X2", 100, 400),
                        task("Task_B", 100, 560),
                    ],
                    [INTO_X, ...X_FLOWS],
                ),
                layoutOf(
                    [
                        TASK_A,
                        task("Task_Y1", 110, 260),
                        task("Task_Y2", 110, 410),
                        task("Task_B", 100, 560),
                    ],
                    [INTO_Y, ...Y_FLOWS],
                ),
            ],
            pair: ["Task_X1", "Task_Y1"] as const,
        },
        {
            leaves: "a chain drawn top to bottom on the shape it leads into",
            result: layoutOf(
                [
                    TASK_A,
                    task("Task_Y1", 100, 250),
                    task("Task_Y2", 100, 400),
                    task("Task_B", 100, 300),
                ],
                [INTO_Y, ...Y_FLOWS],
            ),
            sides: [
                layoutOf([TASK_A, task("Task_B", 100, 300)]),
                layoutOf(
                    [
                        TASK_A,
                        task("Task_Y1", 100, 250),
                        task("Task_Y2", 100, 400),
                        task("Task_B", 100, 560),
                    ],
                    [INTO_Y, ...Y_FLOWS],
                ),
            ],
            pair: ["Task_Y1", "Task_B"] as const,
        },
        {
            leaves: "a single step on the shape it leads into",
            result: layoutOf(
                [TASK_A, Y[0]!, task("Task_B", 300)],
                [INTO_Y, flow("Flow_YB", "Task_Y1", "Task_B")],
            ),
            sides: [
                layoutOf([TASK_A, task("Task_B", 300)]),
                sideWith([Y[0]!], [INTO_Y, flow("Flow_YB", "Task_Y1", "Task_B")]),
            ],
            pair: ["Task_Y1", "Task_B"] as const,
        },
    ])("leaves $leaves", ({ result, sides, pair }) => {
        expect(roomFor(twoChainsInLine, result, pair, sides)).toBeUndefined();
        expect(roomFor(chainBeforeWhatItLeadsInto, result, pair, sides)).toBeUndefined();
    });
});
