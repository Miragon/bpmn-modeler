import {
    LAYOUT_TOLERANCE,
    centerOf,
    liesWithin,
    outlineDistance,
    overlapsBeyondTolerance,
    pointBounds,
    segmentEntersShape,
} from "./layoutGeometry";
import {
    type FlowEnd,
    type LaneShape,
    type LayoutEdge,
    type LayoutModel,
    type LayoutShape,
    type NodeShape,
    belongTogether,
    endShapeOf,
    framesOf,
    nodeShapeIn,
} from "./layoutModel";

/** A broken spot in a drawing, by the ids it concerns; two-shape spots list their shapes in document order. */
export type LayoutSpot =
    | {
          readonly kind: "flowEndOffShape";
          readonly flow: string;
          readonly end: string;
          readonly at: FlowEnd;
      }
    | { readonly kind: "shapesOverlap"; readonly shapes: readonly [string, string] }
    | { readonly kind: "flowThroughShape"; readonly flow: string; readonly shape: string }
    | { readonly kind: "shapeOutsideContainer"; readonly shape: string; readonly container: string }
    | {
          readonly kind: "boundaryEventOffHost";
          readonly boundaryEvent: string;
          readonly host: string;
      }
    | { readonly kind: "lanesOverlap"; readonly lanes: readonly [string, string] };

const FLOW_ENDS: readonly FlowEnd[] = ["source", "target"];

/** The ends of the edge whose first or last waypoint misses its shape's outline. */
export function endsOffShape(layout: LayoutModel, edge: LayoutEdge): FlowEnd[] {
    const first = edge.waypoints[0];
    const last = edge.waypoints[edge.waypoints.length - 1];
    if (first === undefined || last === undefined || edge.waypoints.length < 2) return [];
    const points = { source: first, target: last };
    return FLOW_ENDS.filter((end) => {
        const shape = endShapeOf(layout, edge, end);
        return (
            shape !== undefined &&
            outlineDistance(points[end], shape.bounds, shape.outline) > LAYOUT_TOLERANCE
        );
    });
}

export function shapesOverlap(first: NodeShape, second: NodeShape): boolean {
    return (
        first.plane === second.plane &&
        !belongTogether(first, second) &&
        overlapsBeyondTolerance(first.bounds, second.bounds)
    );
}

/** Whether a segment of the edge crosses a shape that is neither an end nor drawn with one. */
export function runsThrough(layout: LayoutModel, edge: LayoutEdge, shape: NodeShape): boolean {
    if (shape.plane !== edge.plane || isDrawnWithAnEnd(layout, edge, shape)) return false;
    return edge.waypoints.some((from, index) => {
        const to = edge.waypoints[index + 1];
        return to !== undefined && segmentEntersShape(from, to, shape.bounds);
    });
}

function isDrawnWithAnEnd(layout: LayoutModel, edge: LayoutEdge, shape: NodeShape): boolean {
    return FLOW_ENDS.some((end) => {
        const id = edge[end];
        const endNode = id === undefined ? undefined : nodeShapeIn(layout, id);
        return id === shape.id || (endNode !== undefined && belongTogether(endNode, shape));
    });
}

/** Whether the node leaves its frame; a boundary event only by its center, as it sits on its host's border. */
export function liesOutside(node: NodeShape, frame: LayoutShape): boolean {
    const probe = node.host === undefined ? node.bounds : pointBounds(centerOf(node.bounds));
    return !liesWithin(probe, frame.bounds);
}

export function isOffItsHost(layout: LayoutModel, boundaryEvent: NodeShape): boolean {
    const host =
        boundaryEvent.host === undefined ? undefined : layout.shapes.get(boundaryEvent.host);
    if (host === undefined || host.plane !== boundaryEvent.plane) return false;
    const distance = outlineDistance(centerOf(boundaryEvent.bounds), host.bounds, "rectangle");
    return Math.abs(distance) > LAYOUT_TOLERANCE;
}

/** Lanes of one parent are stacked, so any overlap between them is broken. */
export function lanesOverlap(first: LaneShape, second: LaneShape): boolean {
    return (
        first.plane === second.plane &&
        first.parent === second.parent &&
        overlapsBeyondTolerance(first.bounds, second.bounds)
    );
}

/** Whether the drawing has the spot, by its own shapes and relations. */
export function hasSpot(layout: LayoutModel, spot: LayoutSpot): boolean {
    switch (spot.kind) {
        case "flowEndOffShape": {
            const edge = layout.edges.get(spot.flow);
            return edge?.[spot.at] === spot.end && endsOffShape(layout, edge).includes(spot.at);
        }
        case "shapesOverlap": {
            const [first, second] = spot.shapes.map((id) => nodeShapeIn(layout, id));
            return first !== undefined && second !== undefined && shapesOverlap(first, second);
        }
        case "flowThroughShape": {
            const edge = layout.edges.get(spot.flow);
            const shape = nodeShapeIn(layout, spot.shape);
            return edge !== undefined && shape !== undefined && runsThrough(layout, edge, shape);
        }
        case "shapeOutsideContainer": {
            const node = nodeShapeIn(layout, spot.shape);
            const frame = node && framesOf(layout, node).find(({ id }) => id === spot.container);
            return node !== undefined && frame !== undefined && liesOutside(node, frame);
        }
        case "boundaryEventOffHost": {
            const node = nodeShapeIn(layout, spot.boundaryEvent);
            return node?.host === spot.host && isOffItsHost(layout, node);
        }
        case "lanesOverlap": {
            const [first, second] = spot.lanes.map((id) => layout.shapes.get(id));
            return first?.kind === "lane" && second?.kind === "lane" && lanesOverlap(first, second);
        }
    }
}
