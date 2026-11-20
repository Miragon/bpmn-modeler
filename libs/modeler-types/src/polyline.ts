export interface PolylinePoint {
    readonly x: number;
    readonly y: number;
}

/** The leg of a polyline from one waypoint to the next. */
export interface PolylineSegment {
    readonly from: PolylinePoint;
    readonly to: PolylinePoint;
    readonly length: number;
}

export function polylineSegments(points: readonly PolylinePoint[]): PolylineSegment[] {
    return points.slice(1).map((to, index) => {
        const from = points[index]!;
        return { from, to, length: Math.hypot(to.x - from.x, to.y - from.y) };
    });
}

type SegmentEnds = Pick<PolylineSegment, "from" | "to">;

/** The point `share` of the way from the segment's start to its end. */
export function pointAlongSegment({ from, to }: SegmentEnds, share: number): PolylinePoint {
    return { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share };
}

/** The segment's middle as half the sum of its ends, which can differ from `pointAlongSegment(segment, 0.5)` in the last bit. */
export function segmentMiddle({ from, to }: SegmentEnds): PolylinePoint {
    return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
}

/** The point halfway along the polyline, measured by length; the origin for no points. */
export function polylineMidpoint(points: readonly PolylinePoint[]): PolylinePoint {
    const segments = polylineSegments(points);
    const half = segments.reduce((sum, { length }) => sum + length, 0) / 2;
    let travelled = 0;
    for (const segment of segments) {
        if (segment.length > 0 && travelled + segment.length >= half) {
            return pointAlongSegment(segment, (half - travelled) / segment.length);
        }
        travelled += segment.length;
    }
    const [first] = points;
    return first === undefined ? { x: 0, y: 0 } : { x: first.x, y: first.y };
}

/** The longest segment, the first of equally long ones. */
export function longestSegment(points: readonly PolylinePoint[]): PolylineSegment | undefined {
    let longest: PolylineSegment | undefined;
    for (const segment of polylineSegments(points)) {
        if (longest === undefined || segment.length > longest.length) longest = segment;
    }
    return longest;
}

/** How far a bend may lie off the straight line between its neighbours, and beyond them, and still count as on it. */
export interface BendTolerance {
    /** The cross product of the bend's two legs below which they count as one line. */
    readonly collinear: number;
    /** How far the bend may lie beyond its neighbours, and how far a point may lie from the one before and repeat it. */
    readonly beyond: number;
}

/** Only a bend exactly on the line between its neighbours counts: no cross product but zero lies below `Number.MIN_VALUE`. */
export const EXACT_BEND_TOLERANCE: BendTolerance = { collinear: Number.MIN_VALUE, beyond: 0 };

/**
 * True when `point` lies on the straight line between its neighbours *and*
 * between them. A flow that runs out and comes straight back is collinear too,
 * but its turning point lies outside its neighbours and stays.
 */
export function isRedundantBend(
    previous: PolylinePoint,
    point: PolylinePoint,
    next: PolylinePoint,
    tolerance: BendTolerance,
): boolean {
    const cross =
        (point.x - previous.x) * (next.y - point.y) - (point.y - previous.y) * (next.x - point.x);
    if (Math.abs(cross) >= tolerance.collinear) return false;
    const between = (value: number, from: number, to: number) =>
        value >= Math.min(from, to) - tolerance.beyond &&
        value <= Math.max(from, to) + tolerance.beyond;
    return between(point.x, previous.x, next.x) && between(point.y, previous.y, next.y);
}

export function isRepeatedPoint(
    previous: PolylinePoint,
    point: PolylinePoint,
    tolerance: BendTolerance,
): boolean {
    return (
        Math.abs(point.x - previous.x) <= tolerance.beyond &&
        Math.abs(point.y - previous.y) <= tolerance.beyond
    );
}

/**
 * The points without repeats and without redundant bends. The first and the
 * last point are docking points and stay, even where they repeat a neighbour.
 */
export function withoutRedundantBends<Point extends PolylinePoint>(
    points: readonly Point[],
    tolerance: BendTolerance,
): Point[] {
    const kept: Point[] = [];
    points.forEach((point, index) => {
        const last = kept[kept.length - 1];
        const isLastPoint = index === points.length - 1;
        if (last !== undefined && !isLastPoint && isRepeatedPoint(last, point, tolerance)) return;
        const beforeLast = kept[kept.length - 2];
        const lastIsRedundant =
            last !== undefined &&
            beforeLast !== undefined &&
            isRedundantBend(beforeLast, last, point, tolerance);
        if (lastIsRedundant) kept[kept.length - 1] = point;
        else kept.push(point);
    });
    return kept;
}
