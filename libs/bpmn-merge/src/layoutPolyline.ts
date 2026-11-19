import { type DiagramBounds, type Point, boundsAround, pointBounds } from "./layoutGeometry";

export type Segment = readonly [Point, Point];

export function segmentsOf(points: readonly Point[]): Segment[] {
    return points.slice(1).map((to, index) => [points[index]!, to] as const);
}

export function polylineBounds(points: readonly Point[]): DiagramBounds {
    return boundsAround(points.map(pointBounds));
}

export function isOrthogonal(points: readonly Point[]): boolean {
    return segmentsOf(points).every(([from, to]) => from.x === to.x || from.y === to.y);
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

/** The points without repeats and without a point in the middle of a straight run. */
export function withoutRedundantPoints(points: readonly Point[]): Point[] {
    const kept: Point[] = [];
    for (const point of points) {
        const last = kept[kept.length - 1];
        if (last !== undefined && last.x === point.x && last.y === point.y) continue;
        const beforeLast = kept[kept.length - 2];
        const straight =
            last !== undefined &&
            beforeLast !== undefined &&
            ((beforeLast.x === last.x && last.x === point.x) ||
                (beforeLast.y === last.y && last.y === point.y));
        if (straight) kept[kept.length - 1] = point;
        else kept.push(point);
    }
    return kept;
}

interface NearestPoint {
    readonly point: Point;
    readonly distance: number;
}

function nearestOnSegment([from, to]: Segment, point: Point): NearestPoint {
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
    const nearest = { x: from.x + along * dx, y: from.y + along * dy };
    return { point: nearest, distance: Math.hypot(point.x - nearest.x, point.y - nearest.y) };
}

/** The polyline's point nearest to `point`, the first of equally near ones. */
export function nearestPointOn(points: readonly Point[], point: Point): Point {
    let best: NearestPoint = { point: points[0]!, distance: Number.POSITIVE_INFINITY };
    for (const segment of segmentsOf(points)) {
        const candidate = nearestOnSegment(segment, point);
        if (candidate.distance < best.distance) best = candidate;
    }
    return best.point;
}

export function distanceToPolyline(points: readonly Point[], point: Point): number {
    const nearest = nearestPointOn(points, point);
    return Math.hypot(point.x - nearest.x, point.y - nearest.y);
}
