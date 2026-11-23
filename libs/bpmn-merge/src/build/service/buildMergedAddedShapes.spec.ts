import { describe, expect, it } from "vitest";

import { dockedVersions, dragNodes, insertIntoFlow } from "../../__fixtures__/dockedModel";
import { layoutModelOf } from "../../__fixtures__/layoutModelOf";
import { parseWithoutWarnings } from "../../__fixtures__/parseWithoutWarnings";
import { buildMerged } from "./buildMerged";
import { prepareMergeSources } from "../../sources/service/buildMergedSources";
import { computeMerge, type MergeVersions } from "../../classify/service/computeMerge";
import { centerOf, rightOf } from "../domain/layout/layoutGeometry";
import type { LayoutModel } from "../domain/layout/layoutModel";
import { introducedLayoutSpots } from "../domain/layout/layoutSpotDetection";
import { MergeDecisions } from "../../decide/domain/mergeDecisions";

const task = (id: string, x: number) => ({
    id,
    type: "task" as const,
    x,
    y: 100,
    lane: "Lane_Sales",
});

/** Current drops Task_X after Check order and Incoming Task_Y after the gateway, each pushing what follows on to make room. */
const BOTH_ADDED_WITH_ROOM = dockedVersions(
    "c8",
    (model) => {
        dragNodes(model, ["Gateway_Ok", "Task_C", "End_Done", "Task_R", "End_Rejected"], 150);
        insertIntoFlow(model, "Flow_2", task("Task_X", 410), "Flow_X");
    },
    (model) => {
        dragNodes(model, ["Task_C", "End_Done"], 150);
        insertIntoFlow(model, "Flow_Yes", task("Task_Y", 515), "Flow_Y");
    },
);

/** Incoming moved the whole order flow down its lane; current dropped Task_X after Check order. */
const ADDED_WHILE_MOVED = dockedVersions(
    "c7",
    (model) => {
        dragNodes(model, ["Gateway_Ok", "Task_C", "End_Done", "Task_R", "End_Rejected"], 150);
        insertIntoFlow(model, "Flow_2", task("Task_X", 410), "Flow_X");
    },
    (model) =>
        dragNodes(model, ["Start_Order", "Task_A", "Gateway_Ok", "Task_C", "End_Done"], 0, 30),
);

async function layoutOf(xml: string): Promise<LayoutModel> {
    return layoutModelOf((await parseWithoutWarnings(xml)).rootElement);
}

async function mergedLayoutOf(versions: MergeVersions) {
    const decisions = MergeDecisions.from(await computeMerge(versions));
    expect(decisions.openConflicts).toEqual([]);
    const built = await buildMerged(await prepareMergeSources(versions), decisions);
    return {
        merged: await layoutOf(built.xml),
        current: await layoutOf(versions.current),
        incoming: await layoutOf(versions.incoming),
    };
}

/** How the shape lies against its predecessor: the gap between them and how far its middle lies below the predecessor's. */
function besidePredecessor(layout: LayoutModel, id: string, predecessor: string) {
    const shape = layout.shapes.get(id)!.bounds;
    const before = layout.shapes.get(predecessor)!.bounds;
    return { gap: shape.x - rightOf(before), below: centerOf(shape).y - centerOf(before).y };
}

describe("buildMerged with shapes only one side added", () => {
    it("keeps each side's added task beside its predecessor, on its row, with room made after it", async () => {
        const { merged, current, incoming } = await mergedLayoutOf(BOTH_ADDED_WITH_ROOM);

        expect(besidePredecessor(merged, "Task_X", "Task_A")).toEqual(
            besidePredecessor(current, "Task_X", "Task_A"),
        );
        expect(besidePredecessor(merged, "Task_Y", "Gateway_Ok")).toEqual(
            besidePredecessor(incoming, "Task_Y", "Gateway_Ok"),
        );
        expect(besidePredecessor(merged, "Task_C", "Task_Y").below).toBe(0);
        expect(besidePredecessor(merged, "Task_C", "Task_Y").gap).toBeGreaterThan(0);
        expect(introducedLayoutSpots(merged, [current, incoming])).toEqual([]);
    });

    it("keeps an added task beside its predecessor where the other side moved the predecessor", async () => {
        const { merged, current } = await mergedLayoutOf(ADDED_WHILE_MOVED);

        expect(besidePredecessor(merged, "Task_X", "Task_A")).toEqual(
            besidePredecessor(current, "Task_X", "Task_A"),
        );
        expect(
            introducedLayoutSpots(merged, [current, await layoutOf(ADDED_WHILE_MOVED.incoming)]),
        ).toEqual([]);
    });
});
