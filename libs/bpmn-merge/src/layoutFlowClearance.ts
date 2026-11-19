import type { DrawingDraft } from "./layoutDrawingDraft";
import { type DiagramBounds, inflated, keepsClearOf } from "./layoutGeometry";
import { segmentsOf } from "./layoutPolyline";
import { type Segment, segmentEntersBounds } from "./layoutSegments";
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

/**
 * Whether no flow comes nearer the box than the clearance beside it, and no
 * label at all: a flow that runs through the box is a spot the flow repair
 * re-routes, one that passes close by stays cramped.
 */
export function crampsNoFlow(box: DiagramBounds, flows: ForeignFlows, clearance: number): boolean {
    const beside = flows.segments.filter(([from, to]) => !segmentEntersBounds(from, to, box));
    return keepsClearOfFlows(box, { ...flows, segments: beside }, clearance);
}
