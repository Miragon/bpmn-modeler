import type {
    MergeBuildNoteContent,
    MergeBuildNoteOfKind,
    MergeNonEmptyIds,
} from "./mergeBuildNotes";

/** A note whose repair can shift shapes to make room. */
type ShiftingNote = MergeBuildNoteOfKind<
    "shapeOutsideContainer" | "shapesOverlap" | "lanesOverlap"
>;

/** A note whose repair can grow frames to hold the shape or lane it moved. */
type MovingNote = MergeBuildNoteOfKind<"shapesOverlap" | "lanesOverlap">;

/** Whether a list holds an id, so that a repair named for shifting or growing can carry it. */
export function isNonEmpty(ids: readonly string[]): ids is MergeNonEmptyIds {
    return ids.length > 0;
}

/** The elements a note names, in the order its entry offers them. */
export function elementsNamedBy(note: MergeBuildNoteContent): string[] {
    switch (note.kind) {
        case "flowEndOffShape":
        case "flowThroughShape":
            return [note.id, ...note.shapes];
        case "shapeOutsideContainer":
            return [note.id, ...note.shapes, ...shapesShiftedBy(note)];
        case "shapesOverlap":
            return [...note.ids, ...shapesShiftedBy(note), ...framesGrownBy(note)];
        case "lanesOverlap":
            return [...note.ids, ...framesGrownBy(note), ...shapesShiftedBy(note)];
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

/** The shapes a note's repair shifted to make room; none for a repair that shifted nothing. */
export function shapesShiftedBy(note: ShiftingNote): readonly string[] {
    return "shifted" in note ? note.shifted : [];
}

/**
 * The frames grown to hold the shape or lane an overlap's repair moved; none for one that grew nothing. A container
 * repair grows the note's own `shapes` instead.
 */
export function framesGrownBy(note: MovingNote): readonly string[] {
    return "grown" in note ? note.grown : [];
}
