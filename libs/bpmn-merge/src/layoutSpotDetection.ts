import { segmentBounds } from "./layoutGeometry";
import { ShapeGrid } from "./layoutGrid";
import {
    type LaneShape,
    type LayoutEdge,
    type LayoutModel,
    type NodeShape,
    framesOf,
} from "./layoutModel";
import {
    type LayoutSpot,
    endsOffShape,
    hasSpot,
    isOffItsHost,
    lanesOverlap,
    liesOutside,
    runsThrough,
    shapesOverlap,
} from "./layoutSpots";

/** The nodes drawn on one plane, in document order, with a grid over their bounds. */
interface PlaneNodes {
    readonly nodes: readonly NodeShape[];
    readonly grid: ShapeGrid;
}

/** Every broken spot of the drawing, by kind, each kind in document order. */
export function detectLayoutSpots(layout: LayoutModel): LayoutSpot[] {
    const shapes = [...layout.shapes.values()];
    const nodes = shapes.filter((shape): shape is NodeShape => shape.kind === "node");
    const planes = planeNodesOf(nodes);
    const edges = [...layout.edges.values()];
    return [
        ...edges.flatMap((edge) =>
            endsOffShape(layout, edge).map((at): LayoutSpot => ({
                kind: "flowEndOffShape",
                flow: edge.id,
                end: edge[at]!,
                at,
            })),
        ),
        ...[...planes.values()].flatMap(overlapSpotsOn),
        ...edges.flatMap((edge) => throughSpotsOf(layout, edge, planes.get(edge.plane))),
        ...nodes.flatMap((node) =>
            framesOf(layout, node)
                .filter((frame) => liesOutside(node, frame))
                .map((frame): LayoutSpot => ({
                    kind: "shapeOutsideContainer",
                    shape: node.id,
                    container: frame.id,
                })),
        ),
        ...nodes
            .filter((node) => isOffItsHost(layout, node))
            .map((node): LayoutSpot => ({
                kind: "boundaryEventOffHost",
                boundaryEvent: node.id,
                host: node.host!,
            })),
        ...laneOverlapSpots(shapes.filter((shape): shape is LaneShape => shape.kind === "lane")),
    ];
}

/** The spots of the result neither side's own drawing has: what the merge broke, not what a side drew. */
export function introducedLayoutSpots(
    result: LayoutModel,
    sides: readonly LayoutModel[],
): LayoutSpot[] {
    return detectLayoutSpots(result).filter((spot) => !sides.some((side) => hasSpot(side, spot)));
}

function planeNodesOf(nodes: readonly NodeShape[]): Map<string, PlaneNodes> {
    const byPlane = new Map<string, NodeShape[]>();
    for (const node of nodes) {
        const onPlane = byPlane.get(node.plane);
        if (onPlane === undefined) byPlane.set(node.plane, [node]);
        else onPlane.push(node);
    }
    return new Map(
        [...byPlane].map(([plane, onPlane]) => [
            plane,
            { nodes: onPlane, grid: new ShapeGrid(onPlane.map(({ bounds }) => bounds)) },
        ]),
    );
}

function overlapSpotsOn({ nodes, grid }: PlaneNodes): LayoutSpot[] {
    return nodes.flatMap((node, index) =>
        grid
            .indicesNear(node.bounds)
            .filter((other) => other > index && shapesOverlap(node, nodes[other]!))
            .map((other): LayoutSpot => ({
                kind: "shapesOverlap",
                shapes: [node.id, nodes[other]!.id],
            })),
    );
}

function throughSpotsOf(
    layout: LayoutModel,
    edge: LayoutEdge,
    plane: PlaneNodes | undefined,
): LayoutSpot[] {
    if (plane === undefined) return [];
    const candidates = new Set<number>();
    edge.waypoints.forEach((from, index) => {
        const to = edge.waypoints[index + 1];
        if (to === undefined) return;
        for (const near of plane.grid.indicesNear(segmentBounds(from, to))) candidates.add(near);
    });
    return [...candidates]
        .sort((first, second) => first - second)
        .map((index) => plane.nodes[index]!)
        .filter((shape) => runsThrough(layout, edge, shape))
        .map((shape): LayoutSpot => ({ kind: "flowThroughShape", flow: edge.id, shape: shape.id }));
}

function laneOverlapSpots(lanes: readonly LaneShape[]): LayoutSpot[] {
    return lanes.flatMap((lane, index) =>
        lanes
            .slice(index + 1)
            .filter((other) => lanesOverlap(lane, other))
            .map((other): LayoutSpot => ({ kind: "lanesOverlap", lanes: [lane.id, other.id] })),
    );
}
