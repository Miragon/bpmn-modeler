import {
    type ModdleElement,
    idOf,
    isModdleElement,
    isType,
    moddleElements,
} from "@miragon/bpmn-modeler-diff";

import type { FlowRepair } from "./layoutFlowRepair";
import type { Point } from "./layoutGeometry";

/**
 * Writes each re-routed flow's waypoints and label into the first edge that
 * draws it, the one `layoutModelOf` reads; nothing else of the drawing changes.
 */
export function writeFlowRepairs(
    definitions: ModdleElement,
    repairs: readonly FlowRepair[],
    createPoint: (point: Point) => ModdleElement,
): void {
    const moved = new Map(
        repairs.flatMap((repair) =>
            repair.kind === "movedByBuild" ? [[repair.flow, repair]] : [],
        ),
    );
    if (moved.size === 0) return;
    const written = new Set<string>();
    for (const diagram of moddleElements(definitions.diagrams)) {
        const drawings = (diagram.plane as ModdleElement | undefined)?.planeElement;
        for (const drawing of moddleElements(drawings)) {
            const id = idOf(drawing.bpmnElement);
            const repair = id === undefined ? undefined : moved.get(id);
            if (repair === undefined || written.has(repair.flow)) continue;
            if (!isType(drawing, "bpmndi:BPMNEdge")) continue;
            written.add(repair.flow);
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
}
