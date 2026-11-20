import {
    type MergeBuildNoteContent,
    elementsNamedBy,
    framesGrownBy,
    shapesShiftedBy,
} from "@miragon/bpmn-modeler-types/mergeBuildNotes";

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
            return [note.moved, ...shapesShiftedBy(note), ...framesGrownBy(note)];
        case "lanesOverlap":
            return [note.moved, ...note.grown, ...shapesShiftedBy(note)];
    }
}
