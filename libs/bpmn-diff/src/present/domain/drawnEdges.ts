import type { ModdleElement } from "./bpmnFlowOrder";
import type { DiffSideView } from "./diffResult";

/**
 * Ids of the BPMN elements drawn as an edge (a `bpmndi:BPMNEdge` with
 * waypoints) in any diagram of the given definitions: sequence and message
 * flows, associations and data associations alike.
 */
export function collectDrawnEdgeIds(definitions: readonly ModdleElement[]): Set<string> {
    const edgeIds = new Set<string>();
    for (const root of definitions) {
        for (const diagram of asArray(root.diagrams)) {
            const plane = diagram.plane as ModdleElement | undefined;
            for (const planeElement of asArray(plane?.planeElement)) {
                if (planeElement.$type !== "bpmndi:BPMNEdge") continue;
                const drawnElementId = (planeElement.bpmnElement as ModdleElement | undefined)?.id;
                if (drawnElementId) edgeIds.add(drawnElementId);
            }
        }
    }
    return edgeIds;
}

/**
 * The connections a stepper skips: one whose only change is its layout follows
 * its moved shapes. One that also changed semantically is still visited.
 */
export function layoutOnlyEdgeIds(
    changes: DiffSideView,
    isDrawnEdge: (id: string) => boolean,
): Set<string> {
    const semanticIds = new Set([...changes.added, ...changes.removed, ...changes.changed]);
    return new Set(changes.layoutChanged.filter((id) => !semanticIds.has(id) && isDrawnEdge(id)));
}

function asArray(value: unknown): ModdleElement[] {
    return Array.isArray(value) ? (value as ModdleElement[]) : [];
}
