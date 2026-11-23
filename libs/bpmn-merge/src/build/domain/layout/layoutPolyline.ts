import {
    EXACT_BEND_TOLERANCE,
    polylineSegments,
    withoutRedundantBends,
} from "@miragon/bpmn-modeler-types/domain";

import { type DiagramBounds, type Point, boundsAround, pointBounds } from "./layoutGeometry";
import { type NearestPoint, nearestOnSegment } from "./layoutSegments";

export function polylineBounds(points: readonly Point[]): DiagramBounds {
    return boundsAround(points.map(pointBounds));
}

export function isOrthogonal(points: readonly Point[]): boolean {
    return polylineSegments(points).every(({ from, to }) => from.x === to.x || from.y === to.y);
}

/** The points without repeats and without a point in the middle of a straight run; a turning point stays. */
export function withoutRedundantPoints(points: readonly Point[]): Point[] {
    return withoutRedundantBends(points, EXACT_BEND_TOLERANCE);
}

/** The polyline's point nearest to `point`, the first of equally near ones. */
export function nearestPointOn(points: readonly Point[], point: Point): Point {
    let best: NearestPoint = { point: points[0]!, distance: Number.POSITIVE_INFINITY };
    for (const segment of polylineSegments(points)) {
        const candidate = nearestOnSegment(segment, point);
        if (candidate.distance < best.distance) best = candidate;
    }
    return best.point;
}

export function distanceToPolyline(points: readonly Point[], point: Point): number {
    const nearest = nearestPointOn(points, point);
    return Math.hypot(point.x - nearest.x, point.y - nearest.y);
}
