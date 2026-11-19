import type { MergeBuildNoteContent } from "@miragon/bpmn-modeler-types/mergeBuildNotes";

/** The elements a note names, in the order its entry offers them. */
export function elementsNamedBy(note: MergeBuildNoteContent): string[] {
    switch (note.kind) {
        case "flowEndOffShape":
        case "flowThroughShape":
            return [note.id, ...note.shapes];
        case "shapeOutsideContainer":
            return note.repair === "grewContainerAndShifted"
                ? [note.id, ...note.shapes, ...note.shifted]
                : [note.id, ...note.shapes];
        case "shapesOverlap":
            return note.repair === "madeRoom"
                ? [...note.ids, ...note.shifted, ...note.grown]
                : [...note.ids];
        case "lanesOverlap":
            return note.repair === "movedByBuild"
                ? [...note.ids, ...note.grown, ...note.shifted]
                : [...note.ids];
        case "layoutChangedByBoth":
            return [...note.ids];
        case "boundaryEventOffHost":
            return [note.id, note.host];
        case "restoredWithoutRemovedWith":
            return [note.id, ...(note.boundaryEvents ?? []), ...note.connections];
        case "defaultFlowNotRestored":
            return [
                note.id,
                note.flow,
                ...(note.keptDefault === undefined ? [] : [note.keptDefault]),
            ];
        case "flowNotDrawn":
            return [note.id, note.source, note.target].filter((id) => id !== undefined);
        case "frameDiffers":
            return [];
    }
}

/**
 * The elements whose drawing the build's layout repair changed for a note, each of them one the
 * note names: a spot's other members stay as drawn.
 */
export function elementsRedrawnBy(note: MergeBuildNoteContent): string[] {
    if (!("repair" in note) || note.repair === "notRepaired") return [];
    switch (note.kind) {
        case "flowEndOffShape":
        case "flowThroughShape":
            return [note.id];
        case "shapeOutsideContainer":
            return note.repair === "movedIntoContainer" ? [note.id] : elementsNamedBy(note);
        case "shapesOverlap":
            return note.repair === "madeRoom"
                ? [note.moved, ...note.shifted, ...note.grown]
                : [note.moved];
        case "lanesOverlap":
            return [note.moved, ...note.grown, ...note.shifted];
    }
}
