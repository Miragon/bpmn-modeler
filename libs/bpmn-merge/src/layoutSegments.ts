import {
    type Axis,
    type DiagramBounds,
    type Outline,
    type Point,
    LAYOUT_TOLERANCE,
    bottomOf,
    boundsAround,
    centerOf,
    inflated,
    outlineDistance,
    pointBounds,
    rightOf,
} from "./layoutGeometry";

export type Segment = readonly [Point, Point];

/** A horizontal (`y`) or vertical (`x`) line through the diagram. */
export interface AxisLine {
    readonly axis: Axis;
    readonly at: number;
}

/** Whether the two segments cross at one point inside both, not merely touch. */
export function segmentsCross([a, b]: Segment, [c, d]: Segment): boolean {
    const turn = (p: Point, q: Point, r: Point) =>
        Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
    return turn(a, b, c) * turn(a, b, d) < 0 && turn(c, d, a) * turn(c, d, b) < 0;
}

/** How long two axis-parallel segments run on one line, give or take a pixel. */
export function sharedRunLength([a, b]: Segment, [c, d]: Segment): number {
    const overlap = (from: number, to: number, otherFrom: number, otherTo: number) =>
        Math.max(
            0,
            Math.min(Math.max(from, to), Math.max(otherFrom, otherTo)) -
                Math.max(Math.min(from, to), Math.min(otherFrom, otherTo)),
        );
    if (a.y === b.y && c.y === d.y && Math.abs(a.y - c.y) <= 1) return overlap(a.x, b.x, c.x, d.x);
    if (a.x === b.x && c.x === d.x && Math.abs(a.x - c.x) <= 1) return overlap(a.y, b.y, c.y, d.y);
    return 0;
}

export interface NearestPoint {
    readonly point: Point;
    readonly distance: number;
}

export function nearestOnSegment(segment: Segment, point: Point): NearestPoint {
    const [from, to] = segment;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const lengthSquared = dx * dx + dy * dy;
    const along =
        lengthSquared === 0
            ? 0
            : Math.max(
                  0,
                  Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared),
              );
    const nearest = pointAlong(segment, along);
    return { point: nearest, distance: Math.hypot(point.x - nearest.x, point.y - nearest.y) };
}

/** The point `share` of the way from the segment's start to its end. */
export function pointAlong([from, to]: Segment, share: number): Point {
    return { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share };
}

export function segmentBounds([from, to]: Segment): DiagramBounds {
    return boundsAround([pointBounds(from), pointBounds(to)]);
}

/**
 * Whether the segment enters the shape deeper than the tolerance, so a flow
 * running along the outline does not count.
 */
export function segmentEntersShape(segment: Segment, bounds: DiagramBounds): boolean {
    return segmentEntersBounds(segment, inflated(bounds, -LAYOUT_TOLERANCE));
}

/** Whether the segment enters the open inside of the bounds (Liang-Barsky clipping). */
export function segmentEntersBounds([from, to]: Segment, bounds: DiagramBounds): boolean {
    if (bounds.width <= 0 || bounds.height <= 0) return false;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    let enter = 0;
    let leave = 1;
    for (const [direction, room] of [
        [-dx, from.x - bounds.x],
        [dx, rightOf(bounds) - from.x],
        [-dy, from.y - bounds.y],
        [dy, bottomOf(bounds) - from.y],
    ] as const) {
        if (direction === 0) {
            if (room <= 0) return false;
            continue;
        }
        const at = room / direction;
        if (direction < 0) enter = Math.max(enter, at);
        else leave = Math.min(leave, at);
        if (enter >= leave) return false;
    }
    return true;
}

/** Ternary search steps that find a segment's deepest point to well under a pixel. */
const DEEPEST_POINT_STEPS = 40;

/**
 * Whether the segment passes inside the outline deeper than the tolerance, so
 * a segment leaving the outline outwards or running along it does not count.
 * Every outline is convex, so the distance along the segment has one minimum.
 */
export function segmentEntersOutline(
    segment: Segment,
    bounds: DiagramBounds,
    outline: Outline,
): boolean {
    const distanceAt = (share: number) =>
        outlineDistance(pointAlong(segment, share), bounds, outline);
    let low = 0;
    let high = 1;
    for (let step = 0; step < DEEPEST_POINT_STEPS; step++) {
        const first = low + (high - low) / 3;
        const second = high - (high - low) / 3;
        if (distanceAt(first) < distanceAt(second)) high = second;
        else low = first;
    }
    return distanceAt((low + high) / 2) < -LAYOUT_TOLERANCE;
}

/**
 * Where the line meets the outline on the side `towards` of the center: a
 * horizontal line on the right for +1, a vertical one at the bottom for +1.
 * Rounded to whole pixels, as the modeler docks; undefined when the line misses.
 */
export function outlinePointOn(
    line: AxisLine,
    bounds: DiagramBounds,
    outline: Outline,
    towards: 1 | -1,
): Point | undefined {
    const center = centerOf(bounds);
    const horizontal = line.axis === "y";
    const across = horizontal ? bounds.height / 2 : bounds.width / 2;
    const along = horizontal ? bounds.width / 2 : bounds.height / 2;
    const offset = line.at - (horizontal ? center.y : center.x);
    const reach = reachAlong(outline, along, across, Math.abs(offset));
    if (reach === undefined) return undefined;
    const end = Math.round((horizontal ? center.x : center.y) + towards * reach);
    return horizontal ? { x: end, y: line.at } : { x: line.at, y: end };
}

/** How far from the center the outline lies along a line `offset` away from it. */
function reachAlong(
    outline: Outline,
    halfAlong: number,
    halfAcross: number,
    offset: number,
): number | undefined {
    if (offset > halfAcross) return undefined;
    if (outline === "circle") {
        const radius = Math.min(halfAlong, halfAcross);
        return offset > radius ? undefined : Math.sqrt(radius * radius - offset * offset);
    }
    if (outline === "diamond") return halfAlong * (1 - offset / halfAcross);
    return halfAlong;
}

/** Whether the line crosses the bounds at least `margin` away from their corners. */
export function spansAlong(bounds: DiagramBounds, line: AxisLine, margin: number): boolean {
    const [low, high] =
        line.axis === "y" ? [bounds.y, bottomOf(bounds)] : [bounds.x, rightOf(bounds)];
    return line.at > low + margin && line.at < high - margin;
}

/** Which side of the bounds' center the point lies on along the axis, as `outlinePointOn` takes `towards`. */
export function sideOfCenter(bounds: DiagramBounds, point: Point, axis: Axis): 1 | -1 {
    return point[axis] > centerOf(bounds)[axis] ? 1 : -1;
}
