import type { DrawingDraft } from "./layoutDrawingDraft";
import { type DiagramBounds, inflated, keepsClearOf, segmentEntersBounds } from "./layoutGeometry";
import { type Segment, segmentsOf } from "./layoutPolyline";
import { type ShapeGroup, ownEdgesOf } from "./layoutShapeGroups";

/** The flows near a placement that are not the moved group's own, by their segments and labels. */
export interface ForeignFlows {
    readonly segments: readonly Segment[];
    readonly labels: readonly DiagramBounds[];
}

/** The flows on the group's plane that may come near the window and are not the group's own. */
export function foreignFlowsNear(
    draft: DrawingDraft,
    group: ShapeGroup,
    window: DiagramBounds,
): ForeignFlows {
    const own = ownEdgesOf(group);
    const flows = draft.edgesNear(group.node.plane, window).filter(({ id }) => !own.has(id));
    return {
        segments: flows.flatMap(({ waypoints }) => segmentsOf(waypoints)),
        labels: flows.flatMap(({ label }) => (label === undefined ? [] : [label])),
    };
}

/** Whether the box keeps clear of the flows and their labels by the clearance. */
export function keepsClearOfFlows(
    box: DiagramBounds,
    flows: ForeignFlows,
    clearance: number,
): boolean {
    const clear = inflated(box, clearance);
    return (
        !flows.segments.some(([from, to]) => segmentEntersBounds(from, to, clear)) &&
        flows.labels.every((label) => keepsClearOf(box, label, clearance))
    );
}
