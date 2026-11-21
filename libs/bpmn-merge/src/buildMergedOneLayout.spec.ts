import { describe, expect, it } from "vitest";

import type { BpmnFixtureModel } from "./__fixtures__/bpmnModelBuilder";
import {
    dock,
    dockedVersions,
    dragNodes,
    insertIntoFlow,
    recoloured,
} from "./__fixtures__/dockedModel";
import { layoutModelOf } from "./__fixtures__/layoutModelOf";
import { parseWithoutWarnings } from "./__fixtures__/parseWithoutWarnings";
import { buildMerged } from "./buildMerged";
import { prepareMergeSources } from "./buildMergedSources";
import { computeMerge, type MergeVersions } from "./computeMerge";
import { centerOf, rightOf } from "./layoutGeometry";
import type { LayoutModel } from "./layoutModel";
import { introducedLayoutSpots } from "./layoutSpotDetection";
import { MergeDecisions } from "./mergeDecisions";

const SALES_ROW = ["Start_Order", "Task_A", "Gateway_Ok", "Task_C", "End_Done"];

/** Spreads the flow 25 % wider and gives each lane 40 px more height, as a tidy-up of the whole diagram does. */
function relaidOut(model: BpmnFixtureModel): void {
    const [pool] = model.pools;
    pool!.width = Math.round(pool!.width * 1.25);
    pool!.height += 80;
    const [sales, back] = model.lanes;
    sales!.width = pool!.width - 30;
    sales!.height += 40;
    back!.width = pool!.width - 30;
    back!.y += 40;
    back!.height += 40;
    for (const node of model.nodes) {
        node.x = Math.round(160 + (node.x - 160) * 1.25);
        node.y += node.lane === "Lane_Back" ? 60 : 20;
    }
    dock(model);
}

/** Drops Task_X after Check order, pushing what follows and the pool's right border on to make room. */
function addedWithRoom(model: BpmnFixtureModel): void {
    dragNodes(model, ["Gateway_Ok", "Task_C", "End_Done", "Task_R", "End_Rejected"], 150);
    model.pools[0]!.width += 150;
    for (const lane of model.lanes) lane.width += 150;
    insertIntoFlow(
        model,
        "Flow_2",
        { id: "Task_X", type: "task", x: 410, y: 100, lane: "Lane_Sales" },
        "Flow_X",
    );
}

const RELAID_OUT_WHILE_ADDED = dockedVersions("c8", addedWithRoom, relaidOut);

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

const boundsIn = (layout: LayoutModel, id: string) => layout.shapes.get(id)?.bounds;

const middleY = (layout: LayoutModel, id: string) => centerOf(boundsIn(layout, id)!).y;

describe("buildMerged when one side moved most of the drawing", () => {
    it("draws what both sides moved as the side that re-laid out the diagram, with the other side's added task beside its neighbour", async () => {
        const { merged, current, incoming } = await mergedLayoutOf(RELAID_OUT_WHILE_ADDED);

        for (const id of [
            "Participant_Order",
            "Lane_Sales",
            "Lane_Back",
            "Start_Order",
            "Task_A",
        ]) {
            expect(boundsIn(merged, id), id).toEqual(boundsIn(incoming, id));
        }
        for (const id of SALES_ROW) {
            expect(middleY(merged, id), id).toBe(middleY(incoming, id));
        }
        const taskA = boundsIn(merged, "Task_A")!;
        const taskX = boundsIn(merged, "Task_X")!;
        expect(taskX.x - rightOf(taskA)).toBe(
            boundsIn(current, "Task_X")!.x - rightOf(boundsIn(current, "Task_A")!),
        );
        expect(middleY(merged, "Task_X")).toBe(middleY(merged, "Task_A"));
        expect(introducedLayoutSpots(merged, [current, incoming])).toEqual([]);
    });

    it("puts a shape only the other side moved where the leading side draws it when it lands on another", async () => {
        const versions = dockedVersions(
            "c8",
            (model) => dragNodes(model, ["Task_R"], 160),
            (model) => {
                dragNodes(model, SALES_ROW, 100);
                dragNodes(model, ["End_Rejected"], -192);
            },
        );

        const { merged, incoming } = await mergedLayoutOf(versions);

        expect(boundsIn(merged, "Task_R")).toEqual(boundsIn(incoming, "Task_R"));
    });

    it("keeps current's drag when incoming only recoloured the diagram", async () => {
        const versions = dockedVersions(
            "c8",
            (model) => dragNodes(model, ["Task_C"], 0, 30),
            () => undefined,
        );

        const { merged, current } = await mergedLayoutOf({
            ...versions,
            incoming: recoloured(versions.incoming),
        });

        expect(boundsIn(merged, "Task_C")).toEqual(boundsIn(current, "Task_C"));
    });

    it("keeps current's drawing of what both sides moved when neither side moved most of the drawing", async () => {
        const versions = dockedVersions(
            "c7",
            (model) => dragNodes(model, ["Task_C", "End_Done"], 140),
            (model) => dragNodes(model, ["Task_C"], 0, 30),
        );

        const { merged, current } = await mergedLayoutOf(versions);

        expect(boundsIn(merged, "Task_C")).toEqual(boundsIn(current, "Task_C"));
    });
});
