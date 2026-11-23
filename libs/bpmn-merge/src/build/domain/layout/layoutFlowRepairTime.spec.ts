import { loadBpmnModdle } from "@miragon/bpmn-modeler-diff";
import { describe, expect, it } from "vitest";

import { generateLargeC7Model } from "../../../../../../scripts/perf/largeBpmnModel.mjs";
import { withShiftedTasks } from "../../../__fixtures__/shiftedTasks";
import { perParseOf } from "../../../__fixtures__/timeAgainstParsing";
import { at, box, flow, lane, layoutOf, node, pool } from "../../../__fixtures__/layoutShapes";
import type { BuildNoteContent } from "../buildNotes";
import { planContainerMoves } from "./layoutContainerMoves";
import { BUILD_LAYOUT_REPAIRS, planLayoutRepair } from "./layoutDrawingRepair";
import { type FlowRepair, planFlowRepairs } from "./layoutFlowRepair";
import type { LayoutEdge, LayoutModel, LayoutShape } from "./layoutModel";
import { layoutModelOf } from "../../../__fixtures__/layoutModelOf";
import { planShapeMoves } from "./layoutShapeMoves";
import { detectLayoutSpots, introducedLayoutSpots } from "./layoutSpotDetection";

/**
 * The flow repairs the build plans for the result against a side drawn as `sideXml`, and how
 * long finding the spots and planning the repairs takes per millisecond the build spends parsing
 * the result: both share the runner's load.
 */
async function repairPerParseOf(resultXml: string, sideXml: string) {
    const { result, side } = await layoutsOf(resultXml, sideXml);
    const plan = () => planFlowRepairs(result, introducedLayoutSpots(result, [side, side]));
    return { repairs: plan(), perParse: await perParseOf(resultXml, plan) };
}

async function layoutsOf(resultXml: string, sideXml: string) {
    const moddle = (await loadBpmnModdle())();
    const layoutOf = async (xml: string) => layoutModelOf((await moddle.fromXML(xml)).rootElement);
    return { result: await layoutOf(resultXml), side: await layoutOf(sideXml) };
}

const kindsOf = (repairs: readonly FlowRepair[]) => repairs.map(({ kind }) => kind);

// Measured against parsing the result once, best of five each, on 800 KB (44 ms to parse), with
// and without coverage: 0.44 with ten flows re-routed (12.6 ms for the repair), 0.1 to 0.15 with
// ten flows into tasks hidden behind others, which no port leaves. Without the check for an open
// port, those ten took 1.2 s.
const MAX_REPAIR_PER_PARSE = 1;

describe("flow repair time", () => {
    it.each([
        { label: "into the gap below their row", dy: 50, kind: "movedByBuild" },
        { label: "onto the task below", dy: 140, kind: "notRepaired" },
    ] as const)(
        "plans the flows of five tasks moved $label in an 800 KB file in a fraction of parsing it",
        { timeout: 60_000 },
        async ({ dy, kind }) => {
            const { xml } = generateLargeC7Model({ rows: 28, perRow: 50 });

            const { repairs, perParse } = await repairPerParseOf(withShiftedTasks(xml, 0, dy), xml);

            expect(kindsOf(repairs)).toEqual(Array.from({ length: 10 }, () => kind));
            expect(perParse).toBeLessThan(MAX_REPAIR_PER_PARSE);
        },
    );
});

/** The whole repair the build plans for the result against a side, per millisecond of parsing the result. */
async function layoutRepairPerParseOf(resultXml: string, sideXml: string) {
    const { result, side } = await layoutsOf(resultXml, sideXml);
    const plan = () => planLayoutRepair(result, [side, side], BUILD_LAYOUT_REPAIRS, []);
    return { notes: plan().notes, perParse: await perParseOf(resultXml, plan) };
}

const overlapRepairsOf = (notes: readonly BuildNoteContent[]) =>
    notes.flatMap((note) => (note.kind === "shapesOverlap" ? [note.repair] : []));

// Measured against parsing the result once, best of five each, on 800 KB (44 ms to parse), the
// whole repair (finding the spots, moving the tasks, finding them again, re-routing their flows):
// 0.14 with five tasks moved back to where the side draws them, 0.21 with five moved to the
// nearest free place, as the side's place is taken too.
const MAX_SHAPE_REPAIR_PER_PARSE = 1;

describe("shape move time", () => {
    it.each([
        { label: "back to where the side draws them", result: 70, side: 0, axis: "y" },
        { label: "to the nearest free place", result: 100, side: -100, axis: "x" },
    ] as const)(
        "moves five tasks $label in an 800 KB file in a fraction of parsing it",
        { timeout: 60_000 },
        async ({ result, side, axis }) => {
            const { xml } = generateLargeC7Model({ rows: 28, perRow: 50 });
            const shifted = (by: number) =>
                axis === "x" ? withShiftedTasks(xml, by, 0) : withShiftedTasks(xml, 0, by);

            const { notes, perParse } = await layoutRepairPerParseOf(
                shifted(result),
                shifted(side),
            );

            expect(overlapRepairsOf(notes)).toEqual(
                Array.from({ length: 5 }, () => "movedByBuild"),
            );
            expect(perParse).toBeLessThan(MAX_SHAPE_REPAIR_PER_PARSE);
        },
    );
});

const taskIn = (inPool: string, id: string, x: number, y: number) =>
    node(id, { bounds: box(x, y), pool: inPool });

/**
 * A message flow from a task in one pool to a second pool of `count` tasks,
 * which one side moved 20 px down, off the flow's end; with `blocked`, a
 * task of the first pool also stands in the flow's way.
 */
function messageFlowIntoLargePool(count: number, blocked: boolean): LayoutModel {
    const perRow = 50;
    const rows = Math.ceil(count / perRow);
    const width = perRow * 160 + 40;
    const pools = [
        pool("Pool_A", box(0, 0, width, 300)),
        pool("Pool_B", box(0, 420, width, rows * 120 + 40)),
    ];
    const tasks = Array.from({ length: count }, (_, index) =>
        taskIn(
            "Pool_B",
            `Task_${index}`,
            40 + (index % perRow) * 160,
            440 + Math.floor(index / perRow) * 120,
        ),
    );
    const sender = taskIn("Pool_A", "Task_Send", 3950, 60);
    const blocker = blocked ? [taskIn("Pool_A", "Task_Block", 3950, 200)] : [];
    const message = flow("Message_1", "Task_Send", "Pool_B", [at(4000, 140), at(4000, 400)], {
        kind: "messageFlow",
    });
    return layoutOf([...pools, sender, ...blocker, ...tasks], [message]);
}

// Measured against parsing the 800 KB file once (37 to 44 ms), best of five each, with and without
// coverage, with 1,000 tasks in the pool: 0.006 to 0.007 to re-dock (0.25 ms), 0.019 to route
// around a task (0.7 ms). With the pool's tasks as obstacles and the router run for a kept route
// that no route can beat, 0.73 and 1.25 (32 and 51 ms).
const MAX_POOL_FLOW_REPAIR_PER_PARSE = 0.25;

describe("flow repair time for a flow into a large pool", () => {
    it.each([
        { label: "re-docks", blocked: false },
        { label: "routes around a task", blocked: true },
    ])(
        "$label in a fraction of parsing an 800 KB file",
        { timeout: 60_000 },
        async ({ blocked }) => {
            const { xml } = generateLargeC7Model({ rows: 28, perRow: 50 });
            const layout = messageFlowIntoLargePool(1_000, blocked);
            const spots = detectLayoutSpots(layout);

            const repairs = planFlowRepairs(layout, spots);
            const perParse = await perParseOf(xml, () => planFlowRepairs(layout, spots));

            expect(kindsOf(repairs)).toEqual(["movedByBuild"]);
            expect(perParse).toBeLessThan(MAX_POOL_FLOW_REPAIR_PER_PARSE);
        },
    );
});

/**
 * Five tasks in rows 0, 4, 8, 12 and 16, each nine columns right of the one before, so the
 * room made for one opens no place near the next.
 */
function isMovedInDensePool(index: number, perRow: number): boolean {
    const row = Math.floor(index / perRow);
    return row % 4 === 0 && row < 20 && index % perRow === 5 + (row / 4) * 9;
}

/**
 * A pool of `rows` rows of 50 tasks 10 px apart, each row's tasks joined by flows, with five
 * tasks moved `dx` along their row: no free place lies near any of them.
 */
function densePool(rows: number, dx: number): LayoutModel {
    const perRow = 50;
    const drawnPool = pool("Pool_A", box(0, 0, perRow * 110 + 100, rows * 140 + 40));
    const tasks = Array.from({ length: rows * perRow }, (_, index) => {
        const task = taskIn(
            "Pool_A",
            `Task_${index}`,
            60 + (index % perRow) * 110,
            40 + Math.floor(index / perRow) * 140,
        );
        return isMovedInDensePool(index, perRow)
            ? { ...task, bounds: { ...task.bounds, x: task.bounds.x + dx } }
            : task;
    });
    const flows = tasks.slice(1).flatMap((task, index): LayoutEdge[] => {
        const source = tasks[index]!;
        if ((index + 1) % perRow === 0) return [];
        const y = source.bounds.y + 40;
        return [
            flow(`Flow_${index}`, source.id, task.id, [
                at(source.bounds.x + 100, y),
                at(task.bounds.x, y),
            ]),
        ];
    });
    return layoutOf([drawnPool, ...tasks], flows);
}

// Measured against parsing the 800 KB file once (42 ms), best of five each, as the build parses
// a large result anyway: 0.6 to 0.7 for room made for five tasks among 1,000 (28 ms), each task
// keeping its place and pushing the rest of its row on, as each room is checked by finding the
// spots of the whole drawing once.
const MAX_ROOM_PER_PARSE = 10;

describe("shape move time in a pool without a free place", () => {
    it(
        "makes room for five tasks among 1,000 in a few times parsing an 800 KB file",
        {
            timeout: 60_000,
        },
        async () => {
            const { xml } = generateLargeC7Model({ rows: 28, perRow: 50 });
            const result = densePool(20, 60);
            const side = densePool(20, -60);
            const spots = introducedLayoutSpots(result, [side, side]);

            const plan = planShapeMoves(result, spots, [side, side], planFlowRepairs);
            const perParse = await perParseOf(xml, () =>
                planShapeMoves(result, spots, [side, side], planFlowRepairs),
            );

            expect(plan.repairs.map(({ repair }) => repair.kind)).toEqual([
                "madeRoomByGrowingAndShifting",
                ...Array.from({ length: 4 }, () => "madeRoomByShifting"),
            ]);
            expect(perParse).toBeLessThan(MAX_ROOM_PER_PARSE);
        },
    );
});

/** The rows the other side added a task to. */
const ADDED_ROWS = [0, 4, 8, 12, 16];

/**
 * A pool `width` wide at `x` of 20 rows of 50 tasks 10 px apart, the rows tasks are added to left
 * empty when `withFreeRows`, and five tasks the other side added, the `index`th at `addedX(index)`.
 */
function poolWithAddedTasks(
    x: number,
    width: number,
    withFreeRows: boolean,
    addedX: (index: number) => number,
): LayoutModel {
    const drawnPool = pool("Pool_A", box(x, 0, width, 20 * 140 + 40));
    const rows = Array.from({ length: 20 }, (_, row) => row).filter(
        (row) => !withFreeRows || !ADDED_ROWS.includes(row),
    );
    const tasks = rows.flatMap((row) =>
        Array.from({ length: 50 }, (_, column) =>
            taskIn("Pool_A", `Task_${row}_${column}`, 60 + column * 110, 40 + row * 140),
        ),
    );
    const added = ADDED_ROWS.map((row, index) =>
        taskIn("Pool_A", `Task_Added_${index}`, addedX(index), 40 + row * 140),
    );
    return layoutOf([drawnPool, ...tasks, ...added]);
}

/** The drawing as the side that added no task draws it. */
function withoutAddedTasks(layout: LayoutModel): LayoutModel {
    const shapes = [...layout.shapes].filter(([id]) => !id.startsWith("Task_Added_"));
    return { shapes: new Map(shapes), edges: layout.edges };
}

// Measured against parsing the 800 KB file once (35 to 44 ms), best of five each, with and without
// coverage: 0.04 to bring five tasks among 750 into the pool as the side moved it (2 ms), 0.13 to
// 0.16 to grow the pool twice among 1,000 tasks and move three into the room (6 ms), as each
// growth is checked by finding the spots of the whole drawing once.
const MAX_CONTAINER_REPAIR_PER_PARSE = 1;

describe("container repair time", () => {
    it.each([
        {
            label: "brings five tasks into a pool the side drew elsewhere",
            result: poolWithAddedTasks(0, 5600, true, () => -200),
            side: poolWithAddedTasks(-300, 5600, true, () => -200),
            kinds: Array.from({ length: 5 }, () => "movedIntoContainer"),
        },
        {
            label: "grows a pool without a free place twice, then moves three tasks into the room it made,",
            result: poolWithAddedTasks(0, 5600, false, (index) => 5560 + index * 130),
            side: poolWithAddedTasks(0, 6600, false, (index) => 5560 + index * 130),
            kinds: [
                "grewContainer",
                "grewContainer",
                "movedIntoContainer",
                "movedIntoContainer",
                "movedIntoContainer",
            ],
        },
    ])("$label in a few times parsing an 800 KB file", { timeout: 60_000 }, async (example) => {
        const { xml } = generateLargeC7Model({ rows: 28, perRow: 50 });
        const sides = [example.side, withoutAddedTasks(example.side)];
        const spots = introducedLayoutSpots(example.result, sides);

        const plan = planContainerMoves(example.result, spots, sides);
        const perParse = await perParseOf(xml, () =>
            planContainerMoves(example.result, spots, sides),
        );

        expect(plan.repairs.map(({ repair }) => repair.kind)).toEqual(example.kinds);
        expect(perParse).toBeLessThan(MAX_CONTAINER_REPAIR_PER_PARSE);
    });
});

const laneIn = (id: string, y: number, width: number) =>
    lane(id, box(30, y, width - 30, 600), { parent: "Process_A", pool: "Pool_A" });

/** A pool of two lanes 600 px tall, `Lane_A` and `second`, each with four rows of 50 tasks. */
function poolOfTwoLanes(second: string): LayoutShape[] {
    const width = 50 * 160 + 40;
    const drawnPool = pool("Pool_A", box(0, 0, width, 1200));
    const tasksOf = (lane: string, top: number) =>
        Array.from({ length: 200 }, (_, index) => ({
            ...taskIn(
                "Pool_A",
                `${lane}_Task_${index}`,
                60 + (index % 50) * 160,
                top + 40 + Math.floor(index / 50) * 140,
            ),
            lanes: [lane],
        }));
    return [
        drawnPool,
        laneIn("Lane_A", 0, width),
        laneIn(second, 600, width),
        ...tasksOf("Lane_A", 0),
        ...tasksOf(second, 600),
    ];
}

// Measured against parsing the 800 KB file once (43 to 48 ms), best of five each, with and without
// coverage: 0.36 to 0.39 (16 to 17 ms) to stack the lane and bring its 200 tasks after it, as each
// follows the lane its side drew it in.
const MAX_LANE_REPAIR_PER_PARSE = 1;

describe("lane stacking time", () => {
    it(
        "stacks a lane the other side added and brings its 200 tasks into it in a fraction of parsing an 800 KB file",
        { timeout: 60_000 },
        async () => {
            const { xml } = generateLargeC7Model({ rows: 28, perRow: 50 });
            const current = layoutOf(poolOfTwoLanes("Lane_B"));
            const incoming = layoutOf(poolOfTwoLanes("Lane_C"));
            const result = layoutOf([
                ...current.shapes.values(),
                ...[...incoming.shapes.values()].filter(({ id }) => id.startsWith("Lane_C")),
            ]);
            const plan = () =>
                planLayoutRepair(result, [current, incoming], BUILD_LAYOUT_REPAIRS, ["Lane_C"]);

            const { notes } = plan();
            const perParse = await perParseOf(xml, plan);

            expect(notes.filter(({ kind }) => kind === "lanesOverlap")).toEqual([
                {
                    kind: "lanesOverlap",
                    ids: ["Lane_C", "Lane_B"],
                    repair: "movedByBuild",
                    moved: "Lane_C",
                    grown: ["Pool_A"],
                },
            ]);
            expect(
                notes.filter(
                    (note) =>
                        note.kind === "shapeOutsideContainer" &&
                        note.repair === "movedIntoContainer",
                ),
            ).toHaveLength(200);
            expect(perParse).toBeLessThan(MAX_LANE_REPAIR_PER_PARSE);
        },
    );
});
