import type { ElementSnapshot, SnapshotReference } from "@miragon/bpmn-modeler-diff";

import type { ElementReference, ElementVersion } from "./mergeResult";

/** `drawnWithoutAPool`: a collaboration's plane draws the process though no pool names it (`processesDrawnWithoutAPool`). */
export function elementVersionOf(
    snapshot: ElementSnapshot,
    drawnWithoutAPool: boolean,
): ElementVersion {
    return {
        ...(snapshot.parent === undefined ? {} : { parent: snapshot.parent }),
        ...(snapshot.container === undefined ? {} : { container: snapshot.container }),
        lanes: [...snapshot.lanes],
        references: snapshot.references.map(elementReferenceOf),
        parts: [...snapshot.parts],
        drawn: snapshot.layout !== undefined || drawnWithoutAPool,
        ...(snapshot.plane === undefined ? {} : { plane: snapshot.plane }),
    };
}

export function elementReferenceOf({
    property,
    target,
    targetPart,
}: SnapshotReference): ElementReference {
    return targetPart === undefined ? { property, target } : { property, target, targetPart };
}
