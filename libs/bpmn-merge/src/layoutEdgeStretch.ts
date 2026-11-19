import {
    type Axis,
    across,
    along,
    atAcross,
    boundsShifted,
    nearSideOf,
    pointShifted,
} from "./layoutAxis";
import { type DiagramBounds, type Point, centerOf } from "./layoutGeometry";
import type { LayoutEdge, LayoutModel } from "./layoutModel";

/**
 * The edge with its ends shifted along the axis, by `bySource` and
 * `byTarget`: moved whole when both ends shifted alike, else stretched by its
 * runs across the axis, so its segments keep their direction; its label goes
 * with the waypoint nearest to it. `before` is the drawing before the shift.
 */
export function stretchedEdge(
    before: LayoutModel,
    edge: LayoutEdge,
    axis: Axis,
    bySource: number,
    byTarget: number,
): LayoutEdge {
    const points = edge.waypoints;
    const runs = runsAcross(axis, points);
    let waypoints: Point[];
    if (bySource === byTarget) {
        waypoints = points.map((point) => pointShifted(axis, point, bySource));
    } else if (runs.length === 1) {
        const from = points[0]!;
        const to = points[points.length - 1]!;
        const middle = (across(axis, from) + across(axis, to)) / 2;
        waypoints = [
            pointShifted(axis, from, bySource),
            atAcross(axis, pointShifted(axis, from, bySource), middle),
            atAcross(axis, pointShifted(axis, to, byTarget), middle),
            pointShifted(axis, to, byTarget),
        ];
    } else {
        const farEnd = bySource >= byTarget ? edge.source : edge.target;
        const farShape = farEnd === undefined ? undefined : before.shapes.get(farEnd);
        const farLine = farShape === undefined ? Infinity : nearSideOf(axis, farShape.bounds);
        const [larger, smaller] = [Math.max(bySource, byTarget), Math.min(bySource, byTarget)];
        waypoints = runs.flatMap(({ from, to }, run) => {
            const by =
                run === 0
                    ? bySource
                    : run === runs.length - 1
                      ? byTarget
                      : along(axis, points[from]!) >= farLine
                        ? larger
                        : smaller;
            return points.slice(from, to + 1).map((point) => pointShifted(axis, point, by));
        });
    }
    if (edge.label === undefined) return { ...edge, waypoints };
    return { ...edge, waypoints, label: labelAlong(axis, edge.label, points, waypoints) };
}

/** The label shifted as far as the waypoint nearest to it. */
function labelAlong(
    axis: Axis,
    label: DiagramBounds,
    points: readonly Point[],
    waypoints: readonly Point[],
): DiagramBounds {
    const nearest = nearestIndexTo(points, centerOf(label));
    const by =
        along(axis, waypoints[Math.min(nearest, waypoints.length - 1)]!) -
        along(axis, points[nearest]!);
    return boundsShifted(axis, label, by);
}

/** The index ranges of consecutive waypoints on one line across the axis: vertical runs for room along x. */
function runsAcross(axis: Axis, points: readonly Point[]): { from: number; to: number }[] {
    const runs: { from: number; to: number }[] = [];
    points.forEach((point, at) => {
        const current = runs[runs.length - 1];
        if (current !== undefined && along(axis, points[current.to]!) === along(axis, point)) {
            current.to = at;
        } else {
            runs.push({ from: at, to: at });
        }
    });
    return runs;
}

function nearestIndexTo(points: readonly Point[], target: Point): number {
    let nearest = 0;
    points.forEach((point, at) => {
        const best = points[nearest]!;
        if (
            Math.hypot(point.x - target.x, point.y - target.y) <
            Math.hypot(best.x - target.x, best.y - target.y)
        ) {
            nearest = at;
        }
    });
    return nearest;
}
