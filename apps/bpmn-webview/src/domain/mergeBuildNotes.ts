import type { MergePaneBuildNote } from "@miragon/bpmn-modeler-shared";

/** The elements a build note names, which its entry offers to show. */
export function buildNoteElementIds(note: MergePaneBuildNote): readonly string[] {
    switch (note.kind) {
        case "flowEndOffShape":
            return [note.id, ...note.ends];
        case "shapesOverlap":
        case "lanesOverlap":
        case "layoutChangedByBoth":
            return note.ids;
        case "flowThroughShape":
            return [note.id, ...note.shapes];
        case "shapeOutsideContainer":
            return [note.id, ...note.containers];
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
        case "frameDiffers":
            return [];
    }
}
