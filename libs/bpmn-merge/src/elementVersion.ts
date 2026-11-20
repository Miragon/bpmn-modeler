import type { ElementSnapshot, SnapshotReference } from "@miragon/bpmn-modeler-diff";

import type { ElementReference, ElementVersion } from "./mergeResult";

/** `drawn` comes from the whole version (`VersionSnapshots.draws`), not from the element's snapshot alone. */
export function elementVersionOf(snapshot: ElementSnapshot, drawn: boolean): ElementVersion {
    return {
        ...(snapshot.parent === undefined ? {} : { parent: snapshot.parent }),
        ...(snapshot.container === undefined ? {} : { container: snapshot.container }),
        lanes: [...snapshot.lanes],
        references: snapshot.references.map(elementReferenceOf),
        parts: [...snapshot.parts],
        drawn,
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
