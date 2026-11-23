import { type SegmentEnds, pointAlongSegment } from "@miragon/bpmn-modeler-types/domain";

import {
    type DiagramBounds,
    type Outline,
    type Point,
    LAYOUT_TOLERANCE,
    bottomOf,
    boundsAround,
    inflated,
    outlineDistance,
    pointBounds,
    rightOf,
} from "./layoutGeometry";

export type Segment = SegmentEnds;

/** Whether the two segments cross at one point inside both, not merely touch. */
export function segmentsCross({ from: a, to: b }: Segment, { from: c, to: d }: Segment): boolean {
    const turn = (p: Point, q: Point, r: Point) =>
        Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
    return turn(a, b, c) * turn(a, b, d) < 0 && turn(c, d, a) * turn(c, d, b) < 0;
}

/** How long two axis-parallel segments run on one line, give or take a pixel. */
export function sharedRunLength({ from: a, to: b }: Segment, { from: c, to: d }: Segment): number {
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
    const { from, to } = segment;
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
    const nearest = pointAlongSegment(segment, along);
    return { point: nearest, distance: Math.hypot(point.x - nearest.x, point.y - nearest.y) };
}

export function segmentBounds({ from, to }: Segment): DiagramBounds {
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
export function segmentEntersBounds({ from, to }: Segment, bounds: DiagramBounds): boolean {
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
        outlineDistance(pointAlongSegment(segment, share), bounds, outline);
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
