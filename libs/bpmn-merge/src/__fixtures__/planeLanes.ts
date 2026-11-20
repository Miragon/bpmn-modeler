import type { DiagramBounds } from "../layoutGeometry";
import type { LaneShape, LayoutModel, LayoutShape, NodeShape } from "../layoutModel";
import { rootPlane } from "./shapePlane";

export const PLANE = "Process_1";

export const box = (x: number, y: number, width = 100, height = 80): DiagramBounds => ({
    x,
    y,
    width,
    height,
});

export const lane = (id: string, bounds: DiagramBounds): LaneShape => ({
    kind: "lane",
    id,
    ...rootPlane(PLANE),
    parent: PLANE,
    outline: "rectangle",
    bounds,
});

export const task = (id: string, bounds: DiagramBounds, inLane: string): NodeShape => ({
    kind: "node",
    id,
    ...rootPlane(PLANE),
    lanes: [inLane],
    subProcesses: [],
    expanded: false,
    mayLieOutsidePool: false,
    outline: "rectangle",
    bounds,
});

/** Two lanes stacked on a plane without a pool, `Lane_1` above `Lane_2`, holding the tasks. */
export function planeLanesWith(tasks: readonly NodeShape[]): LayoutModel {
    const shapes: LayoutShape[] = [
        lane("Lane_1", box(30, 70, 1170, 120)),
        lane("Lane_2", box(30, 190, 1170, 110)),
        ...tasks,
    ];
    return { shapes: new Map(shapes.map((shape) => [shape.id, shape])), edges: new Map() };
}
