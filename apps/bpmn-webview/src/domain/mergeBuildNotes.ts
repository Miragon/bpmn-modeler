import type { MergePaneBuildNote } from "@miragon/bpmn-modeler-shared";

/** The elements a build note names, which its entry offers to show. */
export function buildNoteElementIds(note: MergePaneBuildNote): readonly string[] {
    switch (note.kind) {
        case "flowEndsFromDifferentSides":
            return [note.id, ...note.ends];
        case "addedAtSamePlace":
        case "layoutChangedByBoth":
            return note.ids;
        case "drawnApartFromContainer":
            return [note.id, ...note.containers];
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
