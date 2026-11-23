import { polylineSegments } from "@miragon/bpmn-modeler-types/polyline";
import { type LayoutEdge, type LayoutModel, sharesAnEndWith } from "./layoutModel";
import { segmentsCross, sharedRunLength } from "./layoutSegments";

/** How long, in pixels, two flows must run on one line to count as running on each other. */
const SHARED_RUN = 10;

/**
 * How often the flows cross another flow of their plane, plus how many
 * flows they run on for more than a few pixels; a flow that shares an end
 * with one of them may run on it, as flows join there. A pair of the flows
 * counts once.
 */
export function flowClashesOf(layout: LayoutModel, flows: readonly string[]): number {
    const counted = new Set<string>();
    let clashes = 0;
    for (const id of flows) {
        const edge = layout.edges.get(id);
        if (edge === undefined) continue;
        counted.add(id);
        for (const other of layout.edges.values()) {
            if (other.plane !== edge.plane || counted.has(other.id)) continue;
            clashes += clashesBetween(edge, other);
        }
    }
    return clashes;
}

function clashesBetween(edge: LayoutEdge, other: LayoutEdge): number {
    const crossings = segmentPairsOf(edge, other).filter(([own, theirs]) =>
        segmentsCross(own, theirs),
    ).length;
    return crossings + (runsOn(edge, other) ? 1 : 0);
}

/** Whether the flow runs on the other for more than a few pixels; a flow may run on one it shares an end with, as flows join there. */
export function runsOn(edge: LayoutEdge, other: LayoutEdge): boolean {
    return (
        !sharesAnEndWith(edge, other) &&
        segmentPairsOf(edge, other).some(
            ([own, theirs]) => sharedRunLength(own, theirs) > SHARED_RUN,
        )
    );
}

function segmentPairsOf(edge: LayoutEdge, other: LayoutEdge) {
    return polylineSegments(edge.waypoints).flatMap((own) =>
        polylineSegments(other.waypoints).map((theirs) => [own, theirs] as const),
    );
}
