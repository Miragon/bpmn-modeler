import { describe, expect, it } from "vitest";

import { type BpmnFixtureModel, renderBpmn } from "./__fixtures__/bpmnModelBuilder";
import { dockedModel, moveNode } from "./__fixtures__/dockedModel";
import { layoutModelOf } from "./__fixtures__/layoutModelOf";
import { parseWithoutWarnings } from "./__fixtures__/parseWithoutWarnings";
import type { LayoutModel } from "./layoutModel";
import { detectLayoutSpots } from "./layoutSpotDetection";
import { type LayoutSpot, hasSpot, isFlowSpot, repairedTogether, sameSpot } from "./layoutSpots";

async function layoutOf(edit: (model: BpmnFixtureModel) => void): Promise<LayoutModel> {
    const model = dockedModel("c8");
    edit(model);
    return layoutModelOf((await parseWithoutWarnings(renderBpmn(model))).rootElement);
}

const taskOnReject = (model: BpmnFixtureModel) =>
    model.nodes.push({ id: "Task_N", type: "task", x: 540, y: 280, lane: "Lane_Back" });
const taskOnFlow6 = (model: BpmnFixtureModel) =>
    model.nodes.push({ id: "Task_N", type: "task", x: 700, y: 260, lane: "Lane_Back" });
const boundaryOffTaskA = (model: BpmnFixtureModel) =>
    model.nodes.push({
        id: "Boundary_Late",
        type: "boundaryEvent",
        x: 292,
        y: 202,
        attachedTo: "Task_A",
        lane: "Lane_Sales",
    });
const lanesStacked = (model: BpmnFixtureModel) => {
    model.lanes[0]!.height = 240;
};

describe("isFlowSpot", () => {
    it("tells the spots of a flow from those of shapes", () => {
        const spots: LayoutSpot[] = [
            { kind: "flowEndOffShape", flow: "Flow_1", end: "B", at: "target", lies: "outside" },
            { kind: "flowThroughShape", flow: "Flow_2", shape: "C" },
            { kind: "shapesOverlap", shapes: ["A", "B"] },
            { kind: "shapeOutsideContainer", shape: "A", container: "Pool_1" },
            { kind: "boundaryEventOffHost", boundaryEvent: "E", host: "A" },
            { kind: "lanesOverlap", lanes: ["Lane_1", "Lane_2"] },
        ];

        expect(spots.filter(isFlowSpot).map(({ flow }) => flow)).toEqual(["Flow_1", "Flow_2"]);
    });
});

describe("sameSpot", () => {
    const overlap: LayoutSpot = { kind: "shapesOverlap", shapes: ["A", "B"] };
    const endOff: LayoutSpot = {
        kind: "flowEndOffShape",
        flow: "Flow_1",
        end: "B",
        at: "target",
        lies: "outside",
    };

    it.each<[string, LayoutSpot, LayoutSpot, boolean]>([
        ["the same spot", overlap, { kind: "shapesOverlap", shapes: ["A", "B"] }, true],
        [
            "two shapes named in the other order",
            overlap,
            { kind: "shapesOverlap", shapes: ["B", "A"] },
            true,
        ],
        ["another pair of shapes", overlap, { kind: "shapesOverlap", shapes: ["A", "C"] }, false],
        [
            "two lanes named in the other order",
            { kind: "lanesOverlap", lanes: ["L1", "L2"] },
            { kind: "lanesOverlap", lanes: ["L2", "L1"] },
            true,
        ],
        [
            "properties written in another order",
            endOff,
            { lies: "outside", at: "target", end: "B", flow: "Flow_1", kind: "flowEndOffShape" },
            true,
        ],
        ["an end that misses its shape another way", endOff, { ...endOff, lies: "inside" }, false],
        [
            "another kind on the same ids",
            { kind: "shapeOutsideContainer", shape: "A", container: "B" },
            { kind: "boundaryEventOffHost", boundaryEvent: "A", host: "B" },
            false,
        ],
        [
            "a flow through another shape",
            { kind: "flowThroughShape", flow: "Flow_1", shape: "C" },
            { kind: "flowThroughShape", flow: "Flow_1", shape: "D" },
            false,
        ],
        [
            "a boundary event off another host",
            { kind: "boundaryEventOffHost", boundaryEvent: "E", host: "A" },
            { kind: "boundaryEventOffHost", boundaryEvent: "E", host: "B" },
            false,
        ],
        ["an end of another flow", endOff, { ...endOff, flow: "Flow_2" }, false],
        ["another end shape of a flow", endOff, { ...endOff, end: "C" }, false],
        ["the other end of a flow", endOff, { ...endOff, at: "source" }, false],
        [
            "two lanes and two shapes on the same ids",
            { kind: "shapesOverlap", shapes: ["A", "B"] },
            { kind: "lanesOverlap", lanes: ["A", "B"] },
            false,
        ],
        [
            "a flow through a shape and a shape outside a container on the same ids",
            { kind: "flowThroughShape", flow: "A", shape: "B" },
            { kind: "shapeOutsideContainer", shape: "B", container: "A" },
            false,
        ],
        [
            "a shape outside another container",
            { kind: "shapeOutsideContainer", shape: "A", container: "Lane_1" },
            { kind: "shapeOutsideContainer", shape: "A", container: "Lane_2" },
            false,
        ],
    ])("tells %s", (_, first, second, same) => {
        expect(sameSpot(first, second)).toBe(same);
        expect(sameSpot(second, first)).toBe(same);
    });
});

describe("repairedTogether", () => {
    const endOff: LayoutSpot = {
        kind: "flowEndOffShape",
        flow: "Flow_1",
        end: "B",
        at: "target",
        lies: "outside",
    };

    it.each<[string, LayoutSpot, LayoutSpot, boolean]>([
        [
            "two spots of one flow",
            endOff,
            { kind: "flowThroughShape", flow: "Flow_1", shape: "C" },
            true,
        ],
        [
            "spots of two flows",
            endOff,
            { kind: "flowThroughShape", flow: "Flow_2", shape: "C" },
            false,
        ],
        [
            "two shapes named in the other order",
            { kind: "shapesOverlap", shapes: ["A", "B"] },
            { kind: "shapesOverlap", shapes: ["B", "A"] },
            true,
        ],
        [
            "a shape outside two containers",
            { kind: "shapeOutsideContainer", shape: "A", container: "Lane_1" },
            { kind: "shapeOutsideContainer", shape: "A", container: "Lane_2" },
            false,
        ],
        [
            "a flow and a shape of the same id",
            { kind: "flowThroughShape", flow: "A", shape: "C" },
            { kind: "shapeOutsideContainer", shape: "A", container: "Lane_1" },
            false,
        ],
    ])("tells %s", (_, first, second, together) => {
        expect(repairedTogether(first, second)).toBe(together);
        expect(repairedTogether(second, first)).toBe(together);
    });
});

describe("hasSpot", () => {
    it.each<[string, (model: BpmnFixtureModel) => void, LayoutSpot]>([
        [
            "a flow's end off its shape",
            (model) => moveNode(model, "Task_C", 60),
            {
                kind: "flowEndOffShape",
                flow: "Flow_Yes",
                end: "Task_C",
                at: "target",
                lies: "outside",
            },
        ],
        [
            "two overlapping shapes",
            taskOnReject,
            { kind: "shapesOverlap", shapes: ["Task_R", "Task_N"] },
        ],
        [
            "two overlapping shapes named in the other order",
            taskOnReject,
            { kind: "shapesOverlap", shapes: ["Task_N", "Task_R"] },
        ],
        [
            "a flow through a shape",
            taskOnFlow6,
            { kind: "flowThroughShape", flow: "Flow_6", shape: "Task_N" },
        ],
        [
            "a shape outside its frame",
            (model) => moveNode(model, "End_Rejected", 0, 100),
            { kind: "shapeOutsideContainer", shape: "End_Rejected", container: "Lane_Back" },
        ],
        [
            "a boundary event off its host",
            boundaryOffTaskA,
            { kind: "boundaryEventOffHost", boundaryEvent: "Boundary_Late", host: "Task_A" },
        ],
        [
            "two overlapping lanes",
            lanesStacked,
            { kind: "lanesOverlap", lanes: ["Lane_Sales", "Lane_Back"] },
        ],
        [
            "two overlapping lanes named in the other order",
            lanesStacked,
            { kind: "lanesOverlap", lanes: ["Lane_Back", "Lane_Sales"] },
        ],
    ])("finds %s again", async (_, edit, spot) => {
        expect(hasSpot(await layoutOf(edit), spot)).toBe(true);
    });

    it.each<[string, (model: BpmnFixtureModel) => void, LayoutSpot]>([
        [
            "an end the flow does not have there",
            (model) => moveNode(model, "Task_C", 60),
            {
                kind: "flowEndOffShape",
                flow: "Flow_Yes",
                end: "Task_R",
                at: "target",
                lies: "outside",
            },
        ],
        [
            "an end that misses its shape another way",
            (model) => moveNode(model, "Task_C", 60),
            {
                kind: "flowEndOffShape",
                flow: "Flow_Yes",
                end: "Task_C",
                at: "target",
                lies: "inside",
            },
        ],
        [
            "an end of a flow the drawing lacks",
            (model) => moveNode(model, "Task_C", 60),
            {
                kind: "flowEndOffShape",
                flow: "Flow_None",
                end: "Task_C",
                at: "target",
                lies: "outside",
            },
        ],
        [
            "an overlap with a shape the drawing lacks",
            taskOnReject,
            { kind: "shapesOverlap", shapes: ["Task_R", "Task_None"] },
        ],
        [
            "an overlap of two lanes",
            lanesStacked,
            { kind: "shapesOverlap", shapes: ["Lane_Sales", "Lane_Back"] },
        ],
        [
            "a flow the drawing lacks",
            taskOnFlow6,
            { kind: "flowThroughShape", flow: "Flow_None", shape: "Task_N" },
        ],
        [
            "a flow through a shape the drawing lacks",
            taskOnFlow6,
            { kind: "flowThroughShape", flow: "Flow_6", shape: "Task_None" },
        ],
        [
            "a flow through a shape it misses",
            taskOnFlow6,
            { kind: "flowThroughShape", flow: "Flow_Yes", shape: "Task_N" },
        ],
        [
            "a container that is not the shape's frame",
            (model) => moveNode(model, "End_Rejected", 0, 100),
            { kind: "shapeOutsideContainer", shape: "End_Rejected", container: "Lane_Sales" },
        ],
        [
            "a shape the drawing lacks outside a container",
            (model) => moveNode(model, "End_Rejected", 0, 100),
            { kind: "shapeOutsideContainer", shape: "End_None", container: "Lane_Back" },
        ],
        [
            "a boundary event off another host",
            boundaryOffTaskA,
            { kind: "boundaryEventOffHost", boundaryEvent: "Boundary_Late", host: "Task_C" },
        ],
        [
            "a boundary event the drawing lacks",
            boundaryOffTaskA,
            { kind: "boundaryEventOffHost", boundaryEvent: "Boundary_None", host: "Task_A" },
        ],
        [
            "a lane overlap naming a shape",
            lanesStacked,
            { kind: "lanesOverlap", lanes: ["Lane_Sales", "Task_R"] },
        ],
        [
            "a lane overlap naming a lane the drawing lacks",
            lanesStacked,
            { kind: "lanesOverlap", lanes: ["Lane_Sales", "Lane_None"] },
        ],
    ])("denies %s", async (_, edit, spot) => {
        const layout = await layoutOf(edit);

        expect(detectLayoutSpots(layout)).not.toEqual([]);
        expect(hasSpot(layout, spot)).toBe(false);
    });
});
