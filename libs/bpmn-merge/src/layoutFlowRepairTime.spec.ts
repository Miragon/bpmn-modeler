import { loadBpmnModdle } from "@miragon/bpmn-modeler-diff";
import { describe, expect, it } from "vitest";

import { generateLargeC7Model } from "../../../scripts/perf/largeBpmnModel.mjs";
import type { BuildNote } from "./buildNotes";
import { planContainerMoves } from "./layoutContainerMoves";
import { BUILD_LAYOUT_REPAIRS, planLayoutRepair } from "./layoutDrawingRepair";
import { type FlowRepair, planFlowRepairs } from "./layoutFlowRepair";
import type { LayoutEdge, LayoutModel, LayoutShape, NodeShape } from "./layoutModel";
import { layoutModelOf } from "./layoutModelReader";
import { planShapeMoves } from "./layoutShapeMoves";
import { detectLayoutSpots, introducedLayoutSpots } from "./layoutSpotDetection";

// The library types no host globals; the specs run in Node, which has a sub-millisecond clock.
declare const performance: { now(): number };

async function fastestMillisecondsOf(run: () => unknown): Promise<number> {
    let fastest = Number.POSITIVE_INFINITY;
    for (let attempt = 0; attempt < 5; attempt++) {
        const started = performance.now();
        await run();
        fastest = Math.min(fastest, performance.now() - started);
    }
    return fastest;
}

/**
 * The flow repairs the build plans for the result against a side drawn as `sideXml`, and how
 * long finding the spots and planning the repairs takes per millisecond the build spends parsing
 * the result: both share the runner's load.
 */
async function repairPerParseOf(resultXml: string, sideXml: string) {
    const moddle = (await loadBpmnModdle())();
    const parse = (xml: string) => moddle.fromXML(xml);
    const parsing = await fastestMillisecondsOf(() => parse(resultXml));
    const result = layoutModelOf((await parse(resultXml)).rootElement);
    const side = layoutModelOf((await parse(sideXml)).rootElement);
    const plan = () => planFlowRepairs(result, introducedLayoutSpots(result, [side, side]));
    return { repairs: plan(), perParse: (await fastestMillisecondsOf(plan)) / parsing };
}

/** Moves every 200th task down by `dy`: five tasks in a file of 1,400 nodes, their flows left where they were. */
function withMovedTasks(xml: string, dy: number): string {
    let ordinal = 0;
    return xml.replace(
        /(bpmnElement="(?:svc|user)_\d+_\d+"><dc:Bounds x="\d+" y=")(\d+)"/g,
        (match, prefix: string, y: string) =>
            ++ordinal % 200 === 0 ? `${prefix}${Number(y) + dy}"` : match,
    );
}

const kindsOf = (repairs: readonly FlowRepair[]) => repairs.map(({ kind }) => kind);

// Measured against parsing the result once, best of five each, on 800 KB (44 ms to parse), with
// and without coverage: 0.06 to 0.07 with nothing to repair (detection alone, 2.6 ms), 0.44 with
// ten flows re-routed (12.6 ms for the repair), 0.1 to 0.15 with ten flows into tasks hidden
// behind others, which no port leaves. Without the check for an open port, those ten took 1.2 s.
const MAX_REPAIR_PER_PARSE = 1;

describe("flow repair time", () => {
    it.each([
        { label: "800 KB", rows: 28 },
        { label: "1.1 MB", rows: 40 },
    ])(
        "finds nothing to repair in a $label file in a fraction of parsing it",
        { timeout: 60_000 },
        async ({ rows }) => {
            const { xml } = generateLargeC7Model({ rows, perRow: 50 });

            const { repairs, perParse } = await repairPerParseOf(xml, xml);

            expect(repairs).toEqual([]);
            expect(perParse).toBeLessThan(MAX_REPAIR_PER_PARSE);
        },
    );

    it.each([
        { label: "into the gap below their row", dy: 50, kind: "movedByBuild" },
        { label: "onto the task below", dy: 140, kind: "notRepaired" },
    ] as const)(
        "plans the flows of five tasks moved $label in an 800 KB file in a fraction of parsing it",
        { timeout: 60_000 },
        async ({ dy, kind }) => {
            const { xml } = generateLargeC7Model({ rows: 28, perRow: 50 });

            const { repairs, perParse } = await repairPerParseOf(withMovedTasks(xml, dy), xml);

            expect(kindsOf(repairs)).toEqual(Array.from({ length: 10 }, () => kind));
            expect(perParse).toBeLessThan(MAX_REPAIR_PER_PARSE);
        },
    );
});

/** Moves every 200th task by the offset, onto or beside its neighbours, its flows left where they were. */
function withShiftedTasks(xml: string, dx: number, dy: number): string {
    let ordinal = 0;
    return xml.replace(
        /(bpmnElement="(?:svc|user)_\d+_\d+"><dc:Bounds x=")(\d+)(" y=")(\d+)"/g,
        (match, prefix: string, x: string, between: string, y: string) =>
            ++ordinal % 200 === 0
                ? `${prefix}${Number(x) + dx}${between}${Number(y) + dy}"`
                : match,
    );
}

/** The whole repair the build plans for the result against a side, per millisecond of parsing the result. */
async function layoutRepairPerParseOf(resultXml: string, sideXml: string) {
    const moddle = (await loadBpmnModdle())();
    const parse = (xml: string) => moddle.fromXML(xml);
    const parsing = await fastestMillisecondsOf(() => parse(resultXml));
    const result = layoutModelOf((await parse(resultXml)).rootElement);
    const side = layoutModelOf((await parse(sideXml)).rootElement);
    const plan = () => planLayoutRepair(result, [side, side], BUILD_LAYOUT_REPAIRS, []);
    return { notes: plan().notes, perParse: (await fastestMillisecondsOf(plan)) / parsing };
}

const overlapRepairsOf = (notes: readonly BuildNote[]) =>
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

const COLLABORATION = "Collaboration_1";

function taskIn(pool: string, id: string, x: number, y: number): NodeShape {
    return {
        kind: "node",
        id,
        plane: COLLABORATION,
        planeKind: "root",
        bounds: { x, y, width: 100, height: 80 },
        outline: "rectangle",
        expanded: false,
        subProcesses: [],
        pool,
        lanes: [],
        mayLieOutsidePool: false,
    };
}

/**
 * A message flow from a task in one pool to a second pool of `count` tasks,
 * which one side moved 20 px down, off the flow's end; with `blocked`, a
 * task of the first pool also stands in the flow's way.
 */
function messageFlowIntoLargePool(count: number, blocked: boolean): LayoutModel {
    const perRow = 50;
    const rows = Math.ceil(count / perRow);
    const width = perRow * 160 + 40;
    const pools: LayoutShape[] = [
        {
            kind: "pool",
            id: "Pool_A",
            plane: COLLABORATION,
            planeKind: "root",
            outline: "rectangle",
            bounds: { x: 0, y: 0, width, height: 300 },
        },
        {
            kind: "pool",
            id: "Pool_B",
            plane: COLLABORATION,
            planeKind: "root",
            outline: "rectangle",
            bounds: { x: 0, y: 420, width, height: rows * 120 + 40 },
        },
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
    const flow: LayoutEdge = {
        id: "Message_1",
        plane: COLLABORATION,
        kind: "messageFlow",
        source: "Task_Send",
        target: "Pool_B",
        waypoints: [
            { x: 4000, y: 140 },
            { x: 4000, y: 400 },
        ],
    };
    return {
        shapes: new Map([...pools, sender, ...blocker, ...tasks].map((shape) => [shape.id, shape])),
        edges: new Map([[flow.id, flow]]),
    };
}

// Measured against finding the spots in the same drawing (1 ms), best of five each, with 1,000
// tasks in the pool: 0.25 to re-dock, 1.1 to route around a task. With the pool's tasks as
// obstacles and the router run for a kept route that no route can beat, 30 and 52.
const MAX_REPAIR_PER_DETECTION = 5;

describe("flow repair time for a flow into a large pool", () => {
    it.each([
        { label: "re-docks", blocked: false },
        { label: "routes around a task", blocked: true },
    ])("$label in a few times finding the spots", { timeout: 60_000 }, async ({ blocked }) => {
        const layout = messageFlowIntoLargePool(1_000, blocked);
        const spots = detectLayoutSpots(layout);

        const repairs = planFlowRepairs(layout, spots);
        const detecting = await fastestMillisecondsOf(() => detectLayoutSpots(layout));
        const planning = await fastestMillisecondsOf(() => planFlowRepairs(layout, spots));

        expect(kindsOf(repairs)).toEqual(["movedByBuild"]);
        expect(planning / detecting).toBeLessThan(MAX_REPAIR_PER_DETECTION);
    });
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
    const pool: LayoutShape = {
        kind: "pool",
        id: "Pool_A",
        plane: COLLABORATION,
        planeKind: "root",
        outline: "rectangle",
        bounds: { x: 0, y: 0, width: perRow * 110 + 100, height: rows * 140 + 40 },
    };
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
            {
                id: `Flow_${index}`,
                plane: COLLABORATION,
                kind: "sequenceFlow",
                source: source.id,
                target: task.id,
                waypoints: [
                    { x: source.bounds.x + 100, y },
                    { x: task.bounds.x, y },
                ],
            },
        ];
    });
    return {
        shapes: new Map([pool, ...tasks].map((shape) => [shape.id, shape])),
        edges: new Map(flows.map((flow) => [flow.id, flow])),
    };
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
            const moddle = (await loadBpmnModdle())();
            const { xml } = generateLargeC7Model({ rows: 28, perRow: 50 });
            const result = densePool(20, 60);
            const side = densePool(20, -60);
            const spots = introducedLayoutSpots(result, [side, side]);

            const plan = planShapeMoves(result, spots, [side, side]);
            const parsing = await fastestMillisecondsOf(() => moddle.fromXML(xml));
            const planning = await fastestMillisecondsOf(() =>
                planShapeMoves(result, spots, [side, side]),
            );

            expect(plan.repairs.map(({ kind }) => kind)).toEqual(
                Array.from({ length: 5 }, () => "madeRoom"),
            );
            expect(planning / parsing).toBeLessThan(MAX_ROOM_PER_PARSE);
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
    const pool: LayoutShape = {
        kind: "pool",
        id: "Pool_A",
        plane: COLLABORATION,
        planeKind: "root",
        outline: "rectangle",
        bounds: { x, y: 0, width, height: 20 * 140 + 40 },
    };
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
    return {
        shapes: new Map([pool, ...tasks, ...added].map((shape) => [shape.id, shape])),
        edges: new Map(),
    };
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
        const moddle = (await loadBpmnModdle())();
        const { xml } = generateLargeC7Model({ rows: 28, perRow: 50 });
        const sides = [example.side, withoutAddedTasks(example.side)];
        const spots = introducedLayoutSpots(example.result, sides);

        const plan = planContainerMoves(example.result, spots, sides);
        const parsing = await fastestMillisecondsOf(() => moddle.fromXML(xml));
        const planning = await fastestMillisecondsOf(() =>
            planContainerMoves(example.result, spots, sides),
        );

        expect(plan.repairs.map(({ kind }) => kind)).toEqual(example.kinds);
        expect(planning / parsing).toBeLessThan(MAX_CONTAINER_REPAIR_PER_PARSE);
    });
});

function laneIn(id: string, y: number, width: number): LayoutShape {
    return {
        kind: "lane",
        id,
        plane: COLLABORATION,
        planeKind: "root",
        outline: "rectangle",
        parent: "Process_A",
        pool: "Pool_A",
        bounds: { x: 30, y, width: width - 30, height: 600 },
    };
}

/** A pool of two lanes 600 px tall, `Lane_A` and `second`, each with four rows of 50 tasks. */
function poolOfTwoLanes(second: string): LayoutShape[] {
    const width = 50 * 160 + 40;
    const pool: LayoutShape = {
        kind: "pool",
        id: "Pool_A",
        plane: COLLABORATION,
        planeKind: "root",
        outline: "rectangle",
        bounds: { x: 0, y: 0, width, height: 1200 },
    };
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
        pool,
        laneIn("Lane_A", 0, width),
        laneIn(second, 600, width),
        ...tasksOf("Lane_A", 0),
        ...tasksOf(second, 600),
    ];
}

const layoutOfShapes = (shapes: readonly LayoutShape[]): LayoutModel => ({
    shapes: new Map(shapes.map((shape) => [shape.id, shape])),
    edges: new Map(),
});

// Measured against parsing the 800 KB file once (43 to 48 ms), best of five each, with and without
// coverage: 0.36 to 0.39 (16 to 17 ms) to stack the lane and bring its 200 tasks after it, as each
// follows the lane its side drew it in.
const MAX_LANE_REPAIR_PER_PARSE = 1;

describe("lane stacking time", () => {
    it(
        "stacks a lane the other side added and brings its 200 tasks into it in a fraction of parsing an 800 KB file",
        { timeout: 60_000 },
        async () => {
            const moddle = (await loadBpmnModdle())();
            const { xml } = generateLargeC7Model({ rows: 28, perRow: 50 });
            const current = layoutOfShapes(poolOfTwoLanes("Lane_B"));
            const incoming = layoutOfShapes(poolOfTwoLanes("Lane_C"));
            const result = layoutOfShapes([
                ...current.shapes.values(),
                ...[...incoming.shapes.values()].filter(({ id }) => id.startsWith("Lane_C")),
            ]);
            const plan = () =>
                planLayoutRepair(result, [current, incoming], BUILD_LAYOUT_REPAIRS, ["Lane_C"]);

            const { notes } = plan();
            const parsing = await fastestMillisecondsOf(() => moddle.fromXML(xml));
            const planning = await fastestMillisecondsOf(plan);

            expect(notes.filter(({ kind }) => kind === "lanesOverlap")).toEqual([
                {
                    kind: "lanesOverlap",
                    ids: ["Lane_C", "Lane_B"],
                    repair: "movedByBuild",
                    moved: "Lane_C",
                    grown: ["Pool_A"],
                    shifted: [],
                },
            ]);
            expect(
                notes.filter(
                    (note) =>
                        note.kind === "shapeOutsideContainer" &&
                        note.repair === "movedIntoContainer",
                ),
            ).toHaveLength(200);
            expect(planning / parsing).toBeLessThan(MAX_LANE_REPAIR_PER_PARSE);
        },
    );
});
