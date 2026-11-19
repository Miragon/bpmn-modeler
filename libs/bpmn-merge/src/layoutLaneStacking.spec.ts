import { describe, expect, it } from "vitest";

import { dockedModel } from "./__fixtures__/dockedModel";
import { renderBpmn } from "./__fixtures__/bpmnModelBuilder";
import { parseWithoutWarnings } from "./__fixtures__/parseWithoutWarnings";
import type { DiagramBounds, Point } from "./layoutGeometry";
import { type LaneStackPlan, stackAppendedLanes } from "./layoutLaneStacking";
import type { LaneShape, LayoutEdge, LayoutModel, LayoutShape, NodeShape } from "./layoutModel";
import { layoutModelOf } from "./layoutModelReader";
import { detectLayoutSpots } from "./layoutSpotDetection";

const PLANE = "Collaboration_1";

const box = (x: number, y: number, width = 100, height = 80): DiagramBounds => ({
    x,
    y,
    width,
    height,
});

const at = (x: number, y: number): Point => ({ x, y });

function pool(id: string, bounds: DiagramBounds): LayoutShape {
    return { kind: "pool", id, plane: PLANE, outline: "rectangle", bounds };
}

function lane(
    id: string,
    bounds: DiagramBounds,
    parent = "Process_1",
    inPool = "Pool_1",
): LaneShape {
    return { kind: "lane", id, plane: PLANE, outline: "rectangle", parent, pool: inPool, bounds };
}

function node(id: string, bounds: DiagramBounds, relations: Partial<NodeShape> = {}): NodeShape {
    return {
        kind: "node",
        id,
        plane: PLANE,
        bounds,
        outline: "rectangle",
        expanded: false,
        subProcesses: [],
        pool: "Pool_1",
        lanes: [],
        mayLieOutsidePool: false,
        ...relations,
    };
}

function flow(id: string, source: string, target: string, waypoints: readonly Point[]): LayoutEdge {
    return { id, plane: PLANE, source, target, waypoints };
}

function layoutOf(shapes: readonly LayoutShape[], edges: readonly LayoutEdge[] = []): LayoutModel {
    return {
        shapes: new Map(shapes.map((shape) => [shape.id, shape])),
        edges: new Map(edges.map((edge) => [edge.id, edge])),
    };
}

function planOf(layout: LayoutModel, appendedLanes: readonly string[]): LaneStackPlan {
    return stackAppendedLanes(layout, detectLayoutSpots(layout), appendedLanes);
}

const boundsIn = (plan: LaneStackPlan, id: string) => plan.layout.shapes.get(id)?.bounds;

describe("stackAppendedLanes", () => {
    it("moves an appended lane below its pool's lanes and grows the pool, leaving its members where they lie", () => {
        const member = node("Task_C", box(300, 260), { lanes: ["Lane_C"] });
        const layout = layoutOf([
            pool("Pool_1", box(0, 0, 1200, 400)),
            lane("Lane_A", box(30, 0, 1170, 400)),
            lane("Lane_C", box(30, 200, 1170, 200)),
            member,
        ]);

        const plan = planOf(layout, ["Lane_C"]);

        expect(plan.stacked).toEqual([{ lane: "Lane_C", pool: "Pool_1", overlapped: ["Lane_A"] }]);
        expect(boundsIn(plan, "Lane_C")).toEqual(box(30, 400, 1170, 200));
        expect(boundsIn(plan, "Pool_1")).toEqual(box(0, 0, 1200, 600));
        expect(boundsIn(plan, "Lane_A")).toEqual(box(30, 0, 1170, 400));
        expect(plan.layout.shapes.get("Task_C")).toBe(member);
        expect(
            detectLayoutSpots(plan.layout).filter(({ kind }) => kind === "lanesOverlap"),
        ).toEqual([]);
    });

    it("stacks several appended lanes in their order", () => {
        const layout = layoutOf([
            pool("Pool_1", box(0, 0, 1200, 300)),
            lane("Lane_A", box(30, 0, 1170, 300)),
            lane("Lane_C", box(30, 0, 1170, 150)),
            lane("Lane_D", box(30, 150, 1170, 120)),
        ]);

        const plan = planOf(layout, ["Lane_C", "Lane_D"]);

        expect(plan.stacked.map(({ lane }) => lane)).toEqual(["Lane_C", "Lane_D"]);
        expect(boundsIn(plan, "Lane_C")).toEqual(box(30, 300, 1170, 150));
        expect(boundsIn(plan, "Lane_D")).toEqual(box(30, 450, 1170, 120));
        expect(boundsIn(plan, "Pool_1")).toEqual(box(0, 0, 1200, 570));
    });

    it("inserts a child lane at the bottom of its parent, growing the parent and the pool and shifting what lies below", () => {
        const below = node("Task_B", box(300, 260), { lanes: ["Lane_B"] });
        const above = node("Task_A", box(300, 60), { lanes: ["Lane_A", "Lane_A1"] });
        const layout = layoutOf(
            [
                pool("Pool_1", box(0, 0, 1200, 400)),
                lane("Lane_A", box(30, 0, 1170, 200)),
                lane("Lane_A1", box(60, 0, 1140, 200), "Lane_A"),
                lane("Lane_A2", box(60, 100, 1140, 100), "Lane_A"),
                lane("Lane_B", box(30, 200, 1170, 200)),
                above,
                below,
            ],
            [flow("Flow_1", "Task_A", "Task_B", [at(350, 140), at(350, 260)])],
        );

        const plan = planOf(layout, ["Lane_A2"]);

        expect(boundsIn(plan, "Lane_A2")).toEqual(box(60, 200, 1140, 100));
        expect(boundsIn(plan, "Lane_A")).toEqual(box(30, 0, 1170, 300));
        expect(boundsIn(plan, "Lane_B")).toEqual(box(30, 300, 1170, 200));
        expect(boundsIn(plan, "Pool_1")).toEqual(box(0, 0, 1200, 500));
        expect(boundsIn(plan, "Task_B")).toEqual(box(300, 360));
        expect(boundsIn(plan, "Task_A")).toEqual(box(300, 60));
        expect(plan.layout.edges.get("Flow_1")?.waypoints).toEqual([at(350, 140), at(350, 360)]);
    });

    it("shifts a pool below down with its shapes and stretches the message flow to it", () => {
        const layout = layoutOf(
            [
                pool("Pool_1", box(0, 0, 1200, 200)),
                lane("Lane_A", box(30, 0, 1170, 200)),
                lane("Lane_C", box(30, 100, 1170, 100)),
                node("Task_A", box(300, 60), { lanes: ["Lane_A"] }),
                pool("Pool_2", box(0, 260, 1200, 200)),
                node("Task_X", box(300, 320), { pool: "Pool_2" }),
            ],
            [flow("Message_1", "Task_A", "Task_X", [at(350, 140), at(350, 320)])],
        );

        const plan = planOf(layout, ["Lane_C"]);

        expect(boundsIn(plan, "Pool_1")).toEqual(box(0, 0, 1200, 300));
        expect(boundsIn(plan, "Pool_2")).toEqual(box(0, 360, 1200, 200));
        expect(boundsIn(plan, "Task_X")).toEqual(box(300, 420));
        expect(plan.layout.edges.get("Message_1")?.waypoints).toEqual([at(350, 140), at(350, 420)]);
    });

    it("leaves an overlap alone when neither lane is appended", () => {
        const layout = layoutOf([
            pool("Pool_1", box(0, 0, 1200, 400)),
            lane("Lane_A", box(30, 0, 1170, 300)),
            lane("Lane_B", box(30, 200, 1170, 200)),
        ]);

        const plan = planOf(layout, []);

        expect(plan).toEqual({ layout, stacked: [] });
    });

    it("leaves an appended lane that overlaps no lane where its side drew it", () => {
        const layout = layoutOf([
            pool("Pool_1", box(0, 0, 1200, 400)),
            lane("Lane_A", box(30, 0, 1170, 200)),
            lane("Lane_C", box(30, 200, 1170, 200)),
        ]);

        const plan = planOf(layout, ["Lane_C"]);

        expect(plan).toEqual({ layout, stacked: [] });
    });

    it("reads the pool of each lane of a pool's process", async () => {
        const definitions = await parseWithoutWarnings(renderBpmn(dockedModel("c8")));

        const lanes = [...layoutModelOf(definitions.rootElement).shapes.values()].filter(
            (shape) => shape.kind === "lane",
        );

        expect(lanes.map((shape) => [shape.id, (shape as LaneShape).pool])).toEqual([
            ["Lane_Sales", "Participant_Order"],
            ["Lane_Back", "Participant_Order"],
        ]);
    });
});
