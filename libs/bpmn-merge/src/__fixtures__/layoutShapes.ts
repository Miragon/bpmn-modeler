import type { DiagramBounds, Point } from "../build/domain/layout/layoutGeometry";
import type {
    GroupShape,
    LaneShape,
    LayoutEdge,
    LayoutModel,
    LayoutShape,
    NodeShape,
    PoolShape,
} from "../build/domain/layout/layoutModel";
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

/** The plane a process without a pool draws on: its own, where its lanes lie too. */
export const PROCESS_PLANE = "Process_1";

/** The layout redrawn as a process without a pool draws it: every shape and edge on `PROCESS_PLANE`. */
export function onProcessPlane(layout: LayoutModel): LayoutModel {
    const processPlane = rootPlane(PROCESS_PLANE);
    return layoutOf(
        [...layout.shapes.values()].map((shape) => ({ ...shape, ...processPlane })),
        [...layout.edges.values()].map((edge) => ({ ...edge, plane: PROCESS_PLANE })),
    );
}

/** Two lanes stacked on a plane without a pool, `Lane_1` above `Lane_2`, holding the nodes. */
export function planeLanesWith(nodes: readonly NodeShape[]): LayoutModel {
    return onProcessPlane(
        layoutOf([
            lane("Lane_1", box(30, 70, 1170, 120)),
            lane("Lane_2", box(30, 190, 1170, 110)),
            ...nodes,
        ]),
    );
}

const POOL_OF_LANES = "Pool_1";

/** `Pool_1`, the pool `poolWithLaneHolding` draws, 1200 by 300 unless the bounds say otherwise. */
export const poolOfLanes = (bounds: DiagramBounds = box(0, 0, 1200, 300)): PoolShape =>
    pool(POOL_OF_LANES, bounds);

/** A lane of `Pool_1`, by default its one lane of the pool's full width. */
export const laneInPool = (
    id: string,
    bounds: DiagramBounds = box(30, 0, 1170, 300),
    relations: Partial<LaneShape> = {},
): LaneShape => lane(id, bounds, { pool: POOL_OF_LANES, ...relations });

/** A node in `Pool_1`'s `Lane_1`. */
export const nodeInPoolLane = (
    id: string,
    bounds: DiagramBounds,
    relations: Partial<NodeShape> = {},
): NodeShape => node(id, { bounds, pool: POOL_OF_LANES, lanes: ["Lane_1"], ...relations });

/** `Pool_1` with its one full-width lane `Lane_1`, or the frames given, holding the shapes. */
export function poolWithLaneHolding(
    shapes: readonly LayoutShape[],
    edges: readonly LayoutEdge[] = [],
    frames: readonly LayoutShape[] = [poolOfLanes(), laneInPool("Lane_1")],
): LayoutModel {
    return layoutOf([...frames, ...shapes], edges);
}
