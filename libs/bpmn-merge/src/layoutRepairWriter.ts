import { type ModdleElement, isModdleElement } from "@miragon/bpmn-modeler-diff";

import { diagramIndexOf, flowDrawingOf } from "./diagramIndex";
import type { FlowRepair } from "./layoutFlowRepair";
import type { Point } from "./layoutGeometry";

/** Writes each re-routed flow's waypoints and label into the edge `layoutModelOf` reads; nothing else of the drawing changes. */
export function writeFlowRepairs(
    definitions: ModdleElement,
    repairs: readonly FlowRepair[],
    createPoint: (point: Point) => ModdleElement,
): void {
    const moved = repairs.flatMap((repair) => (repair.kind === "movedByBuild" ? [repair] : []));
    if (moved.length === 0) return;
    const index = diagramIndexOf(definitions);
    for (const repair of moved) {
        const drawing = flowDrawingOf(index, repair.flow)?.element;
        if (drawing === undefined) continue;
        drawing.waypoint = repair.waypoints.map((point) => {
            const waypoint = createPoint(point);
            waypoint.$parent = drawing;
            return waypoint;
        });
        const labelBounds = (drawing.label as ModdleElement | undefined)?.bounds;
        if (repair.label !== undefined && isModdleElement(labelBounds)) {
            labelBounds.x = repair.label.x;
            labelBounds.y = repair.label.y;
        }
    }
}
