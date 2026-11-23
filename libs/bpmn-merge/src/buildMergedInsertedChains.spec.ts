import { describe, expect, it } from "vitest";

import type { BpmnFixtureModel } from "./__fixtures__/bpmnModelBuilder";
import { dockedVersions, dragNodes, insertIntoFlow } from "./__fixtures__/dockedModel";
import { layoutModelOf } from "./__fixtures__/layoutModelOf";
import { parseWithoutWarnings } from "./__fixtures__/parseWithoutWarnings";
import { buildMerged } from "./buildMerged";
import { prepareMergeSources } from "./buildMergedSources";
import { computeMerge, type MergeVersions } from "./computeMerge";
import { rightOf } from "./layoutGeometry";
import type { LayoutModel } from "./layoutModel";
import { introducedLayoutSpots } from "./layoutSpotDetection";
import { MergeDecisions } from "./mergeDecisions";
import { MERGE_SIDES, type MergeSide, otherSide } from "./mergeResult";

const AFTER_CHECK_ORDER = ["Gateway_Ok", "Task_C", "End_Done", "Task_R", "End_Rejected"];

const task = (id: string, x: number) => ({
    id,
    type: "task" as const,
    x,
    y: 100,
    lane: "Lane_Sales",
});

function widen(model: BpmnFixtureModel, by: number): void {
    for (const frame of [...model.pools, ...model.lanes]) frame.width += by;
}

/** Pushes what follows Check order right by `room` and drops two tasks in a row onto its flow, as inserting them in bpmn-js does. */
function insertChain(
    model: BpmnFixtureModel,
    [first, second]: readonly [string, string],
    room: number,
    [firstX, secondX]: readonly [number, number],
): void {
    widen(model, room);
    dragNodes(model, AFTER_CHECK_ORDER, room);
    insertIntoFlow(model, "Flow_2", task(first, firstX), `Flow_${first}`);
    insertIntoFlow(model, `Flow_${first}`, task(second, secondX), `Flow_${second}`);
}

const CHAINS: Readonly<Record<MergeSide, readonly [string, string]>> = {
    current: ["Task_X1", "Task_X2"],
    incoming: ["Task_Y1", "Task_Y2"],
};

/** Each side drops two tasks in a row onto the flow after Check order: one conflict, on that flow's target. */
const BOTH_INSERTED_A_CHAIN = dockedVersions(
    "c8",
    (model) => insertChain(model, CHAINS.current, 300, [410, 560]),
    (model) => insertChain(model, CHAINS.incoming, 280, [400, 540]),
);

/** Incoming inserts its two tasks where current, who only nudged what follows and whose layout is kept, left no room for them. */
const ONE_CHAIN_WITHOUT_ROOM = dockedVersions(
    "c8",
    (model) => {
        widen(model, 20);
        dragNodes(model, AFTER_CHECK_ORDER, 20);
    },
    (model) => insertChain(model, CHAINS.incoming, 280, [400, 540]),
);

async function layoutOf(xml: string): Promise<LayoutModel> {
    return layoutModelOf((await parseWithoutWarnings(xml)).rootElement);
}

async function mergedLayoutOf(versions: MergeVersions, kept?: MergeSide) {
    const decisions = MergeDecisions.from(await computeMerge(versions));
    if (kept !== undefined) expect(decisions.pick("Flow_2", kept).applied).toBe(true);
    expect(decisions.openConflicts).toEqual([]);
    const built = await buildMerged(await prepareMergeSources(versions), decisions);
    return {
        merged: await layoutOf(built.xml),
        current: await layoutOf(versions.current),
        incoming: await layoutOf(versions.incoming),
    };
}

const boundsIn = (layout: LayoutModel, id: string) => layout.shapes.get(id)!.bounds;

/** How far the second shape lies from the first: right of its left border and below its top. */
function offsetBetween(layout: LayoutModel, first: string, second: string) {
    const [from, to] = [boundsIn(layout, first), boundsIn(layout, second)];
    return { right: to.x - from.x, below: to.y - from.y };
}

/** How far each waypoint of the flow lies from the shape's corner. */
function routeFrom(layout: LayoutModel, flow: string, shape: string) {
    const { x, y } = boundsIn(layout, shape);
    return layout.edges.get(flow)!.waypoints.map((point) => ({ x: point.x - x, y: point.y - y }));
}

describe("buildMerged with a chain of shapes each side inserted after one task", () => {
    it.each(MERGE_SIDES)(
        "keeps both chains whole and one after the other, the one the kept flow of %s enters first",
        async (kept) => {
            const sides = await mergedLayoutOf(BOTH_INSERTED_A_CHAIN, kept);
            const { merged } = sides;
            const [entered, bypassed] = [CHAINS[kept], CHAINS[otherSide(kept)]];

            for (const side of MERGE_SIDES) {
                const [first, second] = CHAINS[side];
                expect(offsetBetween(merged, first, second)).toEqual(
                    offsetBetween(sides[side], first, second),
                );
                expect(routeFrom(merged, `Flow_${first}`, first)).toEqual(
                    routeFrom(sides[side], `Flow_${first}`, first),
                );
            }
            expect(boundsIn(merged, entered[0]).x).toBeGreaterThan(
                rightOf(boundsIn(merged, "Task_A")),
            );
            expect(boundsIn(merged, bypassed[0]).x).toBeGreaterThan(
                rightOf(boundsIn(merged, entered[1])),
            );
            expect(boundsIn(merged, "Gateway_Ok").x).toBeGreaterThan(
                rightOf(boundsIn(merged, bypassed[1])),
            );
            expect(introducedLayoutSpots(merged, [sides.current, sides.incoming])).toEqual([]);
        },
    );

    it("makes room for a chain where the other side's layout leaves none: the chain stays whole beside its predecessor and what follows shifts on as one", async () => {
        const { merged, current, incoming } = await mergedLayoutOf(ONE_CHAIN_WITHOUT_ROOM);
        const [first, second] = CHAINS.incoming;

        expect(offsetBetween(merged, "Task_A", first)).toEqual(
            offsetBetween(incoming, "Task_A", first),
        );
        expect(offsetBetween(merged, first, second)).toEqual(
            offsetBetween(incoming, first, second),
        );
        expect(boundsIn(merged, "Gateway_Ok").x).toBeGreaterThan(rightOf(boundsIn(merged, second)));
        for (const following of AFTER_CHECK_ORDER) {
            expect(offsetBetween(merged, "Gateway_Ok", following)).toEqual(
                offsetBetween(current, "Gateway_Ok", following),
            );
        }
        expect(introducedLayoutSpots(merged, [current, incoming])).toEqual([]);
    });
});
