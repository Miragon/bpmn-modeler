import type { DiagramBounds, Point } from "../layoutGeometry";
import type {
    GroupShape,
    LaneShape,
    LayoutEdge,
    LayoutModel,
    LayoutShape,
    NodeShape,
    PoolShape,
} from "../layoutModel";
import { rootPlane } from "./shapePlane";

export const PLANE = "Collaboration_1";

export const box = (x: number, y: number, width = 100, height = 80): DiagramBounds => ({
    x,
    y,
    width,
    height,
});

export const at = (x: number, y: number): Point => ({ x, y });

export function node(id: string, relations: Partial<NodeShape> = {}): NodeShape {
    return {
        kind: "node",
        id,
        ...rootPlane(PLANE),
        bounds: box(0, 0),
        outline: "rectangle",
        expanded: false,
        subProcesses: [],
        lanes: [],
        mayLieOutsidePool: false,
        ...relations,
    };
}

export function pool(id: string, bounds: DiagramBounds = box(0, 0, 900, 300)): PoolShape {
    return {
        kind: "pool",
        id,
        ...rootPlane(PLANE),
        bounds,
        outline: "rectangle",
    };
}

/** A lane of `Process_1`'s lane set, in no pool unless the relations name one. */
export function lane(
    id: string,
    bounds: DiagramBounds,
    relations: Partial<LaneShape> = {},
): LaneShape {
    return {
        kind: "lane",
        id,
        ...rootPlane(PLANE),
        parent: "Process_1",
        outline: "rectangle",
        bounds,
        ...relations,
    };
}

export function group(
    id: string,
    bounds: DiagramBounds,
    relations: Partial<GroupShape> = {},
): GroupShape {
    return {
        kind: "group",
        id,
        ...rootPlane(PLANE),
        outline: "rectangle",
        bounds,
        ...relations,
    };
}

export function flow(
    id: string,
    source: string,
    target: string,
    waypoints: readonly Point[] = [],
    relations: Partial<LayoutEdge> = {},
): LayoutEdge {
    return { id, plane: PLANE, source, target, waypoints, kind: "sequenceFlow", ...relations };
}

export function layoutOf(
    shapes: readonly LayoutShape[],
    edges: readonly LayoutEdge[] = [],
): LayoutModel {
    return {
        shapes: new Map(shapes.map((shape) => [shape.id, shape])),
        edges: new Map(edges.map((edge) => [edge.id, edge])),
    };
}

/** Two lanes stacked on a plane without a pool, `Lane_1` above `Lane_2`, holding the nodes. */
export function planeLanesWith(nodes: readonly NodeShape[]): LayoutModel {
    return layoutOf([
        lane("Lane_1", box(30, 70, 1170, 120)),
        lane("Lane_2", box(30, 190, 1170, 110)),
        ...nodes,
    ]);
}
