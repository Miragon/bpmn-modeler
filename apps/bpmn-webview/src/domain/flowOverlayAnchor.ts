import type { PolylinePoint } from "@miragon/bpmn-modeler-types";

/** Where diagram-js anchors a flow's overlays: the top left corner of its waypoints' box. */
export function flowOverlayAnchor(waypoints: readonly PolylinePoint[]): PolylinePoint {
    return {
        x: Math.min(...waypoints.map(({ x }) => x)),
        y: Math.min(...waypoints.map(({ y }) => y)),
    };
}
