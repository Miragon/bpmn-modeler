import type { DiagramBounds } from "../layoutGeometry";
import type { LayoutEdge, LayoutModel, LayoutShape, NodeShape } from "../layoutModel";
import { rootPlane } from "./shapePlane";

export const PLANE = "Collaboration_1";

export function node(id: string, relations: Partial<NodeShape> = {}): NodeShape {
    return {
        kind: "node",
        id,
        ...rootPlane(PLANE),
        bounds: { x: 0, y: 0, width: 100, height: 80 },
        outline: "rectangle",
        expanded: false,
        subProcesses: [],
        lanes: [],
        mayLieOutsidePool: false,
        ...relations,
    };
}

export function pool(id: string, bounds: DiagramBounds = { x: 0, y: 0, width: 900, height: 300 }) {
    return {
        kind: "pool",
        id,
        ...rootPlane(PLANE),
        bounds,
        outline: "rectangle",
    } as const;
}

export function layoutOf(shapes: readonly LayoutShape[]): LayoutModel {
    return { shapes: new Map(shapes.map((shape) => [shape.id, shape])), edges: new Map() };
}

export const flow: LayoutEdge = {
    id: "Flow_1",
    plane: PLANE,
    source: "A",
    target: "B",
    waypoints: [],
    kind: "sequenceFlow",
};
