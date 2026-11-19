import type { MergePaneBuildNote } from "@miragon/bpmn-modeler-shared";

/** The elements a build note names, which its entry offers to show. */
export function buildNoteElementIds(note: MergePaneBuildNote): readonly string[] {
    switch (note.kind) {
        case "flowEndOffShape":
        case "flowThroughShape":
        case "shapeOutsideContainer":
            return [note.id, ...note.shapes];
        case "shapesOverlap":
        case "lanesOverlap":
        case "layoutChangedByBoth":
            return note.ids;
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
