import type {
    MergeBuildNoteContent,
    MergeBuildNoteOfKind,
    MergeElementAndShapesNote,
    MergeNonEmptyIds,
    MergeNoteRepairOf,
    MergeOverlapNote,
    MergeRepairedNoteKind,
} from "./mergeBuildNotes";

type NoteKind = MergeBuildNoteContent["kind"];

/** A note whose repair can shift shapes to make room. */
type ShiftingNote = MergeBuildNoteOfKind<
    "shapeOutsideContainer" | "shapesOverlap" | "lanesOverlap"
>;

/** A spot of shapes or lanes of which the build moved one. */
interface MovedNote {
    readonly ids: readonly string[];
    readonly moved: string;
}

/** The elements a note names, and those of them whose drawing the build's repair changed. */
interface NoteElements<Note> {
    readonly named: (note: Note) => string[];
    readonly redrawn: (note: Note) => string[];
}

/**
 * The elements of each note: a repaired note's by its kind and repair, any other's by its kind. An entry decides the
 * variant of its note once, for what it names and what the build redrew together.
 */
type NoteElementTable = {
    readonly [Kind in NoteKind]: Kind extends MergeRepairedNoteKind
        ? {
              readonly [Repair in MergeNoteRepairOf<MergeBuildNoteOfKind<Kind>>]: NoteElements<
                  MergeBuildNoteOfKind<Kind> & { readonly repair: Repair }
              >;
          }
        : NoteElements<MergeBuildNoteOfKind<Kind>>;
};

const elementAndShapes = (note: MergeElementAndShapesNote): string[] => [note.id, ...note.shapes];

const ELEMENT_MOVED: NoteElements<MergeElementAndShapesNote> = {
    named: elementAndShapes,
    redrawn: (note) => [note.id],
};

const BROKEN_FLOW_ELEMENTS = {
    movedByBuild: ELEMENT_MOVED,
    notRepaired: unrepaired(elementAndShapes),
};

const NOTE_ELEMENTS: NoteElementTable = {
    flowEndOffShape: BROKEN_FLOW_ELEMENTS,
    flowThroughShape: BROKEN_FLOW_ELEMENTS,
    shapeOutsideContainer: {
        movedIntoContainer: ELEMENT_MOVED,
        grewContainer: redrawingAllNamed(elementAndShapes),
        grewContainerAndShifted: redrawingAllNamed((note) => [
            ...elementAndShapes(note),
            ...note.shifted,
        ]),
        notRepaired: unrepaired(elementAndShapes),
    },
    shapesOverlap: {
        movedByBuild: movedMakingRoom(() => []),
        madeRoomByShifting: movedMakingRoom((note) => note.shifted),
        madeRoomByGrowing: movedMakingRoom((note) => note.grown),
        madeRoomByGrowingAndShifting: movedMakingRoom((note) => [...note.shifted, ...note.grown]),
        notRepaired: unrepaired((note) => [...note.ids]),
    },
    lanesOverlap: {
        movedByBuild: movedMakingRoom((note) => note.grown),
        movedByBuildAndShifted: movedMakingRoom((note) => [...note.grown, ...note.shifted]),
        notRepaired: unrepaired((note) => [...note.ids]),
    },
    layoutChangedByBoth: unrepaired((note) => [...note.ids]),
    boundaryEventOffHost: unrepaired((note) => [note.id, note.host]),
    restoredWithoutRemovedWith: unrepaired((note) => [
        note.id,
        ...(note.boundaryEvents ?? []),
        ...note.connections,
    ]),
    defaultFlowNotRestored: unrepaired((note) => [
        note.id,
        note.flow,
        ...(note.keptDefault === undefined ? [] : [note.keptDefault]),
    ]),
    flowNotDrawn: unrepaired((note) =>
        [note.id, note.source, note.target].filter((id) => id !== undefined),
    ),
    frameDiffers: unrepaired(() => []),
};

/** Whether a list holds an id, so that a repair named for shifting or growing can carry it. */
export function isNonEmpty(ids: readonly string[]): ids is MergeNonEmptyIds {
    return ids.length > 0;
}

/** The elements a note names, in the order its entry offers them. */
export function elementsNamedBy(note: MergeBuildNoteContent): string[] {
    return elementsOf(note).named(note);
}

/**
 * The elements whose drawing the build's layout repair changed for a note, each of them one the note names: a spot's
 * other members stay as drawn.
 */
export function elementsRedrawnBy(note: MergeBuildNoteContent): string[] {
    return elementsOf(note).redrawn(note);
}

/** The shapes a note's repair shifted to make room; none for a repair that shifted nothing. */
export function shapesShiftedBy(note: ShiftingNote): readonly string[] {
    return "shifted" in note ? note.shifted : [];
}

/**
 * The frames grown to hold the shape or lane an overlap's repair moved; none for one that grew nothing. A container
 * repair grows the note's own `shapes` instead.
 */
export function framesGrownBy(note: MergeOverlapNote): readonly string[] {
    return "grown" in note ? note.grown : [];
}

type AnyNoteElements = NoteElements<MergeBuildNoteContent>;

function elementsOf(note: MergeBuildNoteContent): AnyNoteElements {
    // NoteElementTable checks each entry against its kind and repair; this lookup by both is beyond the compiler.
    const entry = (NOTE_ELEMENTS as Record<NoteKind, unknown>)[note.kind];
    return "repair" in note
        ? (entry as Record<string, AnyNoteElements>)[note.repair]!
        : (entry as AnyNoteElements);
}

/** A note the build left as drawn, whatever it names. */
function unrepaired<Note>(named: (note: Note) => string[]): NoteElements<Note> {
    return { named, redrawn: () => [] };
}

/** A note whose repair redrew everything it names. */
function redrawingAllNamed<Note>(named: (note: Note) => string[]): NoteElements<Note> {
    return { named, redrawn: named };
}

/** A spot the build moved one member of, with the room it made for it: what it shifted and grew. */
function movedMakingRoom<Note extends MovedNote>(
    room: (note: Note) => readonly string[],
): NoteElements<Note> {
    return {
        named: (note) => [...note.ids, ...room(note)],
        redrawn: (note) => [note.moved, ...room(note)],
    };
}
