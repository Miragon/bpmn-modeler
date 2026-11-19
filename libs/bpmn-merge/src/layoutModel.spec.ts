import { describe, expect, it } from "vitest";

import type { DiagramBounds } from "./layoutGeometry";
import {
    type LayoutEdge,
    type LayoutModel,
    type LayoutShape,
    type NodeShape,
    otherEndOf,
    sharedFrameOf,
} from "./layoutModel";

const PLANE = "Collaboration_1";

function node(id: string, relations: Partial<NodeShape> = {}): NodeShape {
    return {
        kind: "node",
        id,
        plane: PLANE,
        bounds: { x: 0, y: 0, width: 100, height: 80 },
        outline: "rectangle",
        expanded: false,
        subProcesses: [],
        lanes: [],
        mayLieOutsidePool: false,
        ...relations,
    };
}

function pool(id: string, bounds: DiagramBounds = { x: 0, y: 0, width: 900, height: 300 }) {
    return { kind: "pool", id, plane: PLANE, bounds, outline: "rectangle" } as const;
}

function layoutOf(shapes: readonly LayoutShape[]): LayoutModel {
    return { shapes: new Map(shapes.map((shape) => [shape.id, shape])), edges: new Map() };
}

const flow: LayoutEdge = { id: "Flow_1", plane: PLANE, source: "A", target: "B", waypoints: [] };

describe("otherEndOf", () => {
    it("names a flow's other end", () => {
        expect(otherEndOf("source")).toBe("target");
        expect(otherEndOf("target")).toBe("source");
    });
});

describe("sharedFrameOf", () => {
    it("is the innermost expanded sub-process both ends lie in", () => {
        const layout = layoutOf([
            pool("Pool_1"),
            node("Sub_Outer", { expanded: true, pool: "Pool_1" }),
            node("Sub_Inner", { expanded: true, pool: "Pool_1", subProcesses: ["Sub_Outer"] }),
            node("A", { pool: "Pool_1", subProcesses: ["Sub_Inner", "Sub_Outer"] }),
            node("B", { pool: "Pool_1", subProcesses: ["Sub_Outer"] }),
        ]);

        expect(sharedFrameOf(layout, flow)?.id).toBe("Sub_Outer");
    });

    it("is the pool when the ends share no sub-process drawn open on the flow's plane", () => {
        const layout = layoutOf([
            pool("Pool_1"),
            node("Sub_1", { pool: "Pool_1" }),
            node("A", { pool: "Pool_1", subProcesses: ["Sub_1"] }),
            node("B", { pool: "Pool_1", subProcesses: ["Sub_1"] }),
        ]);

        expect(sharedFrameOf(layout, flow)?.id).toBe("Pool_1");
    });

    it("is none for a flow between two pools, or to a pool", () => {
        const twoPools = layoutOf([
            pool("Pool_1"),
            pool("Pool_2"),
            node("A", { pool: "Pool_1" }),
            node("B", { pool: "Pool_2" }),
        ]);
        const toPool = layoutOf([pool("Pool_1"), pool("B"), node("A", { pool: "Pool_1" })]);

        expect(sharedFrameOf(twoPools, flow)).toBeUndefined();
        expect(sharedFrameOf(toPool, flow)).toBeUndefined();
    });

    it("leaves out the pool of a data store, which may lie outside it", () => {
        const layout = layoutOf([
            pool("Pool_1"),
            node("A", { pool: "Pool_1" }),
            node("B", { pool: "Pool_1", mayLieOutsidePool: true }),
        ]);

        expect(sharedFrameOf(layout, flow)).toBeUndefined();
    });
});
