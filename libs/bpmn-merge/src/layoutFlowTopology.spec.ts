import { describe, expect, it } from "vitest";

import { baseModel } from "./__fixtures__/baseModel";
import { renderBpmn } from "./__fixtures__/bpmnModelBuilder";
import { parseWithoutWarnings } from "./__fixtures__/parseWithoutWarnings";
import type { DiagramBounds } from "./layoutGeometry";
import { FlowTopology } from "./layoutFlowTopology";
import type { EdgeKind, LayoutEdge, LayoutModel, NodeShape } from "./layoutModel";
import { layoutModelOf } from "./layoutModelReader";

const PLANE = "Process_1";

function task(id: string, x: number, y: number, relations: Partial<NodeShape> = {}): NodeShape {
    const bounds: DiagramBounds = { x, y, width: 100, height: 80 };
    return {
        kind: "node",
        id,
        plane: PLANE,
        planeKind: "root",
        planeProcesses: ["Process_1"],
        bounds,
        outline: "rectangle",
        expanded: false,
        subProcesses: [],
        lanes: [],
        mayLieOutsidePool: false,
        ...relations,
    };
}

function flow(source: string, target: string, kind: EdgeKind = "sequenceFlow"): LayoutEdge {
    return { id: `${source}_${target}`, plane: PLANE, source, target, waypoints: [], kind };
}

function layoutOf(shapes: readonly NodeShape[], edges: readonly LayoutEdge[]): LayoutModel {
    return {
        shapes: new Map(shapes.map((shape) => [shape.id, shape])),
        edges: new Map(edges.map((edge) => [edge.id, edge])),
    };
}

function topologyOf(shapes: readonly NodeShape[], edges: readonly LayoutEdge[]): FlowTopology {
    return new FlowTopology(layoutOf(shapes, edges));
}

const ROW = [task("Task_A", 0, 0), task("Task_B", 200, 0), task("Task_C", 400, 0)];

describe("FlowTopology", () => {
    describe("relationOf", () => {
        it("reads a shape a flow leads into from the other as following it", () => {
            const topology = topologyOf(ROW, [flow("Task_A", "Task_B")]);

            expect(topology.relationOf("Task_B", "Task_A")).toBe("follows");
            expect(topology.relationOf("Task_A", "Task_B")).toBe("precedes");
        });

        it("reads two shapes that flow into one shape, or out of one, as parallel branches", () => {
            const join = topologyOf(ROW, [flow("Task_A", "Task_C"), flow("Task_B", "Task_C")]);
            const split = topologyOf(ROW, [flow("Task_A", "Task_B"), flow("Task_A", "Task_C")]);

            expect(join.relationOf("Task_B", "Task_A")).toBe("parallel");
            expect(split.relationOf("Task_C", "Task_B")).toBe("parallel");
        });

        it("reads shapes no flow joins, or joined only by a message flow or an association, as unrelated", () => {
            const topology = topologyOf(ROW, [
                flow("Task_A", "Task_B", "messageFlow"),
                flow("Task_A", "Task_C", "association"),
                flow("Task_B", "Task_C", "association"),
            ]);

            expect(topology.relationOf("Task_B", "Task_A")).toBe("unrelated");
            expect(topology.relationOf("Task_C", "Task_B")).toBe("unrelated");
        });

        it("counts a boundary event's flows as its host's", () => {
            const timer = task("Timer_1", 80, 60, { host: "Task_A", outline: "circle" });
            const topology = topologyOf([...ROW, timer], [flow("Timer_1", "Task_B")]);

            expect(topology.relationOf("Task_B", "Task_A")).toBe("follows");
        });

        it("reads a boundary event as its host when asked about the event itself", () => {
            const timer = task("Timer_1", 80, 60, { host: "Task_A", outline: "circle" });
            const follows = topologyOf([...ROW, timer], [flow("Timer_1", "Task_B")]);
            const parallel = topologyOf(
                [...ROW, timer],
                [flow("Task_A", "Task_C"), flow("Task_B", "Task_C")],
            );

            expect(follows.relationOf("Task_B", "Timer_1")).toBe("follows");
            expect(parallel.relationOf("Task_B", "Timer_1")).toBe("parallel");
        });

        it("reads a flow between two shapes before a shared successor", () => {
            const topology = topologyOf(ROW, [
                flow("Task_A", "Task_B"),
                flow("Task_A", "Task_C"),
                flow("Task_B", "Task_C"),
            ]);

            expect(topology.relationOf("Task_C", "Task_B")).toBe("follows");
        });
    });

    describe("flowsRightAt", () => {
        it("reads the flows at the shapes as running right when their ends lie further right", () => {
            const flows = [flow("Task_A", "Task_B"), flow("Task_B", "Task_C")];
            const layout = layoutOf(ROW, flows);

            expect(new FlowTopology(layout).flowsRightAt(layout, ["Task_B"])).toBe(true);
        });

        it("reads flows that run down or left as not running right", () => {
            const column = [task("Task_A", 0, 0), task("Task_B", 0, 200), task("Task_C", -40, 400)];
            const leftward = layoutOf(ROW, [flow("Task_C", "Task_B"), flow("Task_B", "Task_A")]);
            const downward = layoutOf(column, [flow("Task_A", "Task_B"), flow("Task_B", "Task_C")]);

            expect(new FlowTopology(leftward).flowsRightAt(leftward, ["Task_B"])).toBe(false);
            expect(new FlowTopology(downward).flowsRightAt(downward, ["Task_B"])).toBe(false);
        });

        it("reads shapes no flow touches as running right, as a diagram is drawn", () => {
            const layout = layoutOf(ROW, []);

            expect(new FlowTopology(layout).flowsRightAt(layout, ["Task_B"])).toBe(true);
        });

        it("reads the flows where the drawing it is given draws their ends, after shapes moved", () => {
            const flows = [flow("Task_A", "Task_B"), flow("Task_B", "Task_C")];
            const topology = new FlowTopology(layoutOf(ROW, flows));
            const column = [
                task("Task_A", 200, -200),
                task("Task_B", 200, 0),
                task("Task_C", 200, 200),
            ];

            expect(topology.flowsRightAt(layoutOf(column, flows), ["Task_B"])).toBe(false);
        });
    });

    it("reads each connection's kind from the document", async () => {
        const definitions = (await parseWithoutWarnings(renderBpmn(baseModel("c7")))).rootElement;

        const kinds = [...layoutModelOf(definitions).edges.values()].map(({ id, kind }) => [
            id,
            kind,
        ]);

        expect(kinds).toContainEqual(["Association_Check", "association"]);
        expect(kinds).toContainEqual(["Flow_Start", "sequenceFlow"]);
    });
});
