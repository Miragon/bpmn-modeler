import type { MergePaneHandMergeRefusal } from "./mergePaneMessages";

/** The elements a refusal names, which the pane words by their names. */
export function handMergeRefusalNamedIds(refusal: MergePaneHandMergeRefusal): readonly string[] {
    switch (refusal.kind) {
        case "holdsElementsOfTheirOwn":
        case "namesMissingElement":
        case "namesLeftOutElement":
        case "changesOtherDecisions":
            return refusal.ids;
        case "namesWrongType":
            return refusal.references.map(({ target }) => target);
        // The ids of an id change are the text's own, not elements of either side.
        case "idChanged":
        case "conflictMarkersLeft":
        case "unparsable":
        case "notOneElement":
        case "typeChanged":
        case "beyondOwnAttributes":
        case "unknownNamespace":
        case "rejectedByEngine":
        case "changesStructure":
        case "notHandMergeable":
            return [];
    }
}
