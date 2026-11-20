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
