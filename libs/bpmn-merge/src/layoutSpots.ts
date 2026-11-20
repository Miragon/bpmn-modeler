import { polylineSegments } from "@miragon/bpmn-modeler-types/polyline";
import {
    type OutlineMiss,
    centerOf,
    liesWithin,
    outlineMissOf,
    overlapsBeyondTolerance,
    pointBounds,
} from "./layoutGeometry";
import { framesOf } from "./layoutFrames";
import {
    FLOW_ENDS,
    type FlowEnd,
    type LaneShape,
    type LayoutEdge,
    type LayoutModel,
    type LayoutShape,
    type NodeShape,
    belongTogether,
    drawnHostOf,
    endShapeOf,
    nodeShapeIn,
} from "./layoutModel";
import { segmentEntersShape } from "./layoutSegments";

/** A broken spot in a drawing, by the ids it concerns; two-shape spots list their shapes in document order. */
export type LayoutSpot =
    | {
          readonly kind: "flowEndOffShape";
          readonly flow: string;
          readonly end: string;
          readonly at: FlowEnd;
          /** Kept apart, so an end moved off a flow that a side draws into its shapes' centers is still named. */
          readonly lies: OutlineMiss;
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

type SpotKind = LayoutSpot["kind"];

export type SpotOf<Kind extends SpotKind> = Extract<LayoutSpot, { readonly kind: Kind }>;

/** A spot of one flow, which the build may re-route. */
export type FlowSpot = Extract<LayoutSpot, { readonly flow: string }>;

export function isFlowSpot(spot: LayoutSpot): spot is FlowSpot {
    return "flow" in spot;
}

interface EndOffShape {
    readonly at: FlowEnd;
    readonly lies: OutlineMiss;
}

/** The ends of the edge whose first or last waypoint misses its shape's outline. */
export function endsOffShape(layout: LayoutModel, edge: LayoutEdge): EndOffShape[] {
    const first = edge.waypoints[0];
    const last = edge.waypoints[edge.waypoints.length - 1];
    if (first === undefined || last === undefined || edge.waypoints.length < 2) return [];
    const points = { source: first, target: last };
    return FLOW_ENDS.flatMap((at) => {
        const shape = endShapeOf(layout, edge, at);
        const lies = shape && outlineMissOf(points[at], shape.bounds, shape.outline);
        return lies === undefined ? [] : [{ at, lies }];
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
    return polylineSegments(edge.waypoints).some((segment) =>
        segmentEntersShape(segment, shape.bounds),
    );
}

/** Whether the shape is one of the edge's ends, or encloses, lies in or is attached to one. */
export function isDrawnWithAnEnd(layout: LayoutModel, edge: LayoutEdge, shape: NodeShape): boolean {
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
    const host = drawnHostOf(layout, boundaryEvent);
    if (host === undefined) return false;
    return outlineMissOf(centerOf(boundaryEvent.bounds), host.bounds, "rectangle") !== undefined;
}

/** Lanes of one parent are stacked, so any overlap between them is broken. */
export function lanesOverlap(first: LaneShape, second: LaneShape): boolean {
    return (
        first.plane === second.plane &&
        first.parent === second.parent &&
        overlapsBeyondTolerance(first.bounds, second.bounds)
    );
}

/** What one spot kind knows of its spots. */
interface SpotKindRules<Spot extends LayoutSpot> {
    /** Whether the drawing has the spot, by its own shapes and relations. */
    readonly isIn: (layout: LayoutModel, spot: Spot) => boolean;
    /** Whether two spots of the kind name the same thing broken. */
    readonly isSame: (first: Spot, second: Spot) => boolean;
}

const SPOT_KINDS: { readonly [Kind in SpotKind]: SpotKindRules<SpotOf<Kind>> } = {
    flowEndOffShape: {
        isIn: (layout, spot) => {
            const edge = layout.edges.get(spot.flow);
            return (
                edge?.[spot.at] === spot.end &&
                endsOffShape(layout, edge).some(
                    ({ at, lies }) => at === spot.at && lies === spot.lies,
                )
            );
        },
        isSame: (first, second) =>
            second.flow === first.flow &&
            second.end === first.end &&
            second.at === first.at &&
            second.lies === first.lies,
    },
    shapesOverlap: {
        isIn: (layout, spot) => {
            const [first, second] = spot.shapes.map((id) => nodeShapeIn(layout, id));
            return first !== undefined && second !== undefined && shapesOverlap(first, second);
        },
        isSame: (first, second) => samePair(first.shapes, second.shapes),
    },
    flowThroughShape: {
        isIn: (layout, spot) => {
            const edge = layout.edges.get(spot.flow);
            const shape = nodeShapeIn(layout, spot.shape);
            return edge !== undefined && shape !== undefined && runsThrough(layout, edge, shape);
        },
        isSame: (first, second) => second.flow === first.flow && second.shape === first.shape,
    },
    shapeOutsideContainer: {
        isIn: (layout, spot) => {
            const node = nodeShapeIn(layout, spot.shape);
            const frame = node && framesOf(layout, node).find(({ id }) => id === spot.container);
            return node !== undefined && frame !== undefined && liesOutside(node, frame);
        },
        isSame: (first, second) =>
            second.shape === first.shape && second.container === first.container,
    },
    boundaryEventOffHost: {
        isIn: (layout, spot) => {
            const node = nodeShapeIn(layout, spot.boundaryEvent);
            return node?.host === spot.host && isOffItsHost(layout, node);
        },
        isSame: (first, second) =>
            second.boundaryEvent === first.boundaryEvent && second.host === first.host,
    },
    lanesOverlap: {
        isIn: (layout, spot) => {
            const [first, second] = spot.lanes.map((id) => layout.shapes.get(id));
            return first?.kind === "lane" && second?.kind === "lane" && lanesOverlap(first, second);
        },
        isSame: (first, second) => samePair(first.lanes, second.lanes),
    },
};

/** Asked with a spot of any kind, the rules accept any spot: callers hand them only spots of that kind. */
function rulesOf<Kind extends SpotKind>(kind: Kind): SpotKindRules<SpotOf<Kind>> {
    return SPOT_KINDS[kind];
}

/** Whether two spots name the same thing broken, whichever order they list a pair in. */
export function sameSpot(first: LayoutSpot, second: LayoutSpot): boolean {
    return first.kind === second.kind && rulesOf(first.kind).isSame(first, second);
}

/** Whether one repair acts on both spots: a re-route on every spot of its flow, any other repair on its own spot alone. */
export function repairedTogether(first: LayoutSpot, second: LayoutSpot): boolean {
    return isFlowSpot(first) && isFlowSpot(second)
        ? first.flow === second.flow
        : sameSpot(first, second);
}

function samePair(first: readonly [string, string], second: readonly [string, string]): boolean {
    return (
        (first[0] === second[0] && first[1] === second[1]) ||
        (first[0] === second[1] && first[1] === second[0])
    );
}

/** Whether the drawing has the spot, by its own shapes and relations. */
export function hasSpot(layout: LayoutModel, spot: LayoutSpot): boolean {
    return rulesOf(spot.kind).isIn(layout, spot);
}
