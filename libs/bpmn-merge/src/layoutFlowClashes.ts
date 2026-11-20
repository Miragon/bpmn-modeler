import type { LayoutEdge, LayoutModel } from "./layoutModel";
import { segmentsOf } from "./layoutPolyline";
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
    const pairs = segmentsOf(edge.waypoints).flatMap((own) =>
        segmentsOf(other.waypoints).map((theirs) => [own, theirs] as const),
    );
    const crossings = pairs.filter(([own, theirs]) => segmentsCross(own, theirs)).length;
    const runsOn =
        !sharesAnEnd(edge, other) &&
        pairs.some(([own, theirs]) => sharedRunLength(own, theirs) > SHARED_RUN);
    return crossings + (runsOn ? 1 : 0);
}

function sharesAnEnd(edge: LayoutEdge, other: LayoutEdge): boolean {
    return (
        (edge.source !== undefined && edge.source === other.source) ||
        (edge.target !== undefined && edge.target === other.target)
    );
}
