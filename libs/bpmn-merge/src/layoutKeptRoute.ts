import { type AxisLine, lineThrough, outlinePointOn, sideOfCenter, spansAlong } from "./layoutAxis";
import { type DiagramBounds, type Outline, type Point, centerOf } from "./layoutGeometry";
import {
    type FlowEnd,
    type FlowEnds,
    type LayoutEdge,
    type LayoutModel,
    otherEndOf,
} from "./layoutModel";
import { withoutRedundantPoints } from "./layoutPolyline";
import { endsOffShape } from "./layoutSpots";

/**
 * How far, in pixels, a waypoint must lie beside a shape, away from its
 * corners, for a straight segment to reach the shape from it. Narrower than
 * the router's own ports keep, as it keeps a bend the flow already had.
 */
const BESIDE_MARGIN = 5;

/** The flow with its ends off their shapes docked again, its own bends kept; undefined when no straight segment reaches. */
export function keptRoute(
    layout: LayoutModel,
    edge: LayoutEdge,
    ends: FlowEnds,
): Point[] | undefined {
    const off = new Set<FlowEnd>(endsOffShape(layout, edge).map(({ at }) => at));
    const points = edge.waypoints;
    const first = points[0]!;
    const last = points[points.length - 1]!;
    if (points.length === 2) return keptStraight(first, last, off, ends);
    const start = off.has("source") ? redocked(ends.source, points[1]!) : first;
    const end = off.has("target") ? redocked(ends.target, points[points.length - 2]!) : last;
    if (start === undefined || end === undefined) return undefined;
    return withoutRedundantPoints([start, ...points.slice(1, -1), end]);
}

/** A straight flow stays on its line where both shapes still meet it. */
function keptStraight(
    first: Point,
    last: Point,
    off: ReadonlySet<FlowEnd>,
    ends: FlowEnds,
): Point[] | undefined {
    const line = lineThrough(first, last);
    if (line === undefined) return undefined;
    const dock = (end: FlowEnd, kept: Point) => {
        if (!off.has(end)) return kept;
        const shape = ends[end];
        const towards = sideOfCenter(shape.bounds, centerOf(ends[otherEndOf(end)].bounds), line);
        return outlinePointOn(line, shape.bounds, shape.outline, towards);
    };
    const start = dock("source", first);
    const end = dock("target", last);
    return start === undefined || end === undefined ? undefined : [start, end];
}

/** The outline point a straight segment from `from` reaches when `from` lies beside, above or below the shape. */
function redocked(
    shape: { readonly bounds: DiagramBounds; readonly outline: Outline },
    from: Point,
): Point | undefined {
    const { bounds, outline } = shape;
    const horizontal: AxisLine = { axis: "y", at: from.y };
    const vertical: AxisLine = { axis: "x", at: from.x };
    const besideX = spansAlong(bounds, vertical, BESIDE_MARGIN);
    const besideY = spansAlong(bounds, horizontal, BESIDE_MARGIN);
    if (besideY && !besideX) {
        return outlinePointOn(horizontal, bounds, outline, sideOfCenter(bounds, from, horizontal));
    }
    if (besideX && !besideY) {
        return outlinePointOn(vertical, bounds, outline, sideOfCenter(bounds, from, vertical));
    }
    return undefined;
}
