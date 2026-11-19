import { loadBpmnModdle } from "@miragon/bpmn-modeler-diff";
import { describe, expect, it } from "vitest";

import { generateLargeC7Model } from "../../../scripts/perf/largeBpmnModel.mjs";
import { type FlowRepair, planFlowRepairs } from "./layoutFlowRepair";
import type { LayoutEdge, LayoutModel, LayoutShape, NodeShape } from "./layoutModel";
import { layoutModelOf } from "./layoutModelReader";
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

const COLLABORATION = "Collaboration_1";

function taskIn(pool: string, id: string, x: number, y: number): NodeShape {
    return {
        kind: "node",
        id,
        plane: COLLABORATION,
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
            outline: "rectangle",
            bounds: { x: 0, y: 0, width, height: 300 },
        },
        {
            kind: "pool",
            id: "Pool_B",
            plane: COLLABORATION,
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
