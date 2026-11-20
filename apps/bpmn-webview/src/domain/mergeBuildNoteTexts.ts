import type {
    MergeBuildNoteContent,
    MergeBuildNoteOfKind,
    MergeNoteRepairOf,
    MergeRepairedNoteKind,
    MergeSide,
} from "@miragon/bpmn-modeler-types";

import type { MergeTranslate } from "./mergeTranslate";

type NoteKind = MergeBuildNoteContent["kind"];

/** A note's sentence before translation: its translation key and the names that fill its placeholders. */
interface NoteWording {
    readonly template: string;
    readonly replacements: Record<string, string>;
}

/** The canvas's names of a note's elements, of one or of several in one list. */
interface CanvasNames {
    readonly one: (id: string) => string;
    readonly list: (ids: readonly string[]) => string;
}

type Wording<Note> = (note: Note, names: CanvasNames) => NoteWording;

/**
 * How each note is worded: a repaired note by its kind and repair, any other by its kind. An entry decides the
 * variant of its note once, for the template and its replacements together.
 */
type NoteWordings = {
    readonly [Kind in NoteKind]: Kind extends MergeRepairedNoteKind
        ? {
              readonly [Repair in MergeNoteRepairOf<MergeBuildNoteOfKind<Kind>>]: Wording<
                  MergeBuildNoteOfKind<Kind> & { readonly repair: Repair }
              >;
          }
        : Wording<MergeBuildNoteOfKind<Kind>>;
};

/** A flow and the shapes it misses or runs through, or a shape and the containers it lies outside. */
type ElementAndShapesNote = MergeBuildNoteOfKind<
    "flowEndOffShape" | "flowThroughShape" | "shapeOutsideContainer"
>;

/** Shapes or lanes on top of each other. */
type OverlapNote = MergeBuildNoteOfKind<"shapesOverlap" | "lanesOverlap">;

/** A shape the build moved off the others it lay on. */
type MovedShapeNote = Extract<MergeBuildNoteOfKind<"shapesOverlap">, { readonly moved: string }>;

const LAYOUT_CHANGED_BY_BOTH_TEXTS: Record<MergeSide, string> = {
    current: "Both sides changed the layout of {elements}; current's is kept",
    incoming: "Both sides changed the layout of {elements}; incoming's is kept",
};

const NOTE_WORDINGS: NoteWordings = {
    flowEndOffShape: sharingNames(elementAndShapesNames, {
        movedByBuild: "The build moved {element} to meet {shapes}",
        notRepaired: "{element} does not meet {shapes}; the build could not repair it",
    }),
    flowThroughShape: sharingNames(elementAndShapesNames, {
        movedByBuild: "The build moved {element} around {shapes}",
        notRepaired: "{element} runs through {shapes}; the build could not repair it",
    }),
    shapesOverlap: {
        movedByBuild: (note, names) => ({
            template: "The build moved {element} off {shapes}",
            replacements: movedOffNames(note, names),
        }),
        madeRoom: madeRoomWording,
        notRepaired: (note, names) => ({
            template:
                "{first} and {second} lie on top of each other; the build could not repair it",
            replacements: overlappingNames(note, names),
        }),
    },
    shapeOutsideContainer: {
        ...sharingNames(elementAndShapesNames, {
            movedIntoContainer: "The build moved {element} into {shapes}",
            grewContainer: "The build grew {shapes} to hold {element}",
            notRepaired: "{element} lies outside {shapes}; the build could not repair it",
        }),
        grewContainerAndShifted: (note, names) => ({
            template: "The build grew {shapes} to hold {element} and shifted {shifted}",
            replacements: {
                ...elementAndShapesNames(note, names),
                shifted: names.list(note.shifted),
            },
        }),
    },
    lanesOverlap: {
        movedByBuild: laneStackedWording,
        notRepaired: (note, names) => ({
            template: "{first} and {second} overlap; the build could not repair it",
            replacements: overlappingNames(note, names),
        }),
    },
    boundaryEventOffHost: (note, names) => ({
        template: "{element} is not on the border of {host}",
        replacements: { element: names.one(note.id), host: names.one(note.host) },
    }),
    restoredWithoutRemovedWith: restoredWithoutWording,
    defaultFlowNotRestored: (note, names) => {
        const replacements = { element: names.one(note.id), flow: names.one(note.flow) };
        return note.keptDefault === undefined
            ? {
                  template: "{flow} is kept but is no longer the default flow of {element}",
                  replacements,
              }
            : {
                  template: "{flow} is kept, but {element} keeps {keptDefault} as its default flow",
                  replacements: { ...replacements, keptDefault: names.one(note.keptDefault) },
              };
    },
    layoutChangedByBoth: (note, names) => ({
        template: LAYOUT_CHANGED_BY_BOTH_TEXTS[note.keptSide],
        replacements: { elements: names.list(note.ids) },
    }),
    frameDiffers: (note) => ({
        template: "The file's {attribute} differs between the sides; current's is kept",
        replacements: { attribute: note.attribute },
    }),
    flowNotDrawn: flowNotDrawnWording,
};

/** One note of the last build, in one line. */
export function buildNoteText(
    note: MergeBuildNoteContent,
    nameOf: (id: string) => string,
    translate: MergeTranslate,
): string {
    const names: CanvasNames = { one: nameOf, list: (ids) => ids.map(nameOf).join(", ") };
    const { template, replacements } = wordingOf(note)(note, names);
    return translate(template, replacements);
}

type AnyWording = Wording<MergeBuildNoteContent>;

function wordingOf(note: MergeBuildNoteContent): AnyWording {
    // NoteWordings checks each entry against its kind and repair; this lookup by both is beyond the compiler.
    const entry = (NOTE_WORDINGS as Record<NoteKind, unknown>)[note.kind];
    return "repair" in note
        ? (entry as Record<string, AnyWording>)[note.repair]!
        : (entry as AnyWording);
}

/** Variants of a note that differ only in their template. */
function sharingNames<Note, Variant extends string>(
    namesOf: (note: Note, names: CanvasNames) => Record<string, string>,
    templates: Record<Variant, string>,
): Record<Variant, Wording<Note>> {
    const wordings = Object.entries<string>(templates).map(([variant, template]) => [
        variant,
        (note: Note, names: CanvasNames) => ({ template, replacements: namesOf(note, names) }),
    ]);
    return Object.fromEntries(wordings) as Record<Variant, Wording<Note>>;
}

function elementAndShapesNames(
    note: ElementAndShapesNote,
    names: CanvasNames,
): Record<string, string> {
    return { element: names.one(note.id), shapes: names.list(note.shapes) };
}

function overlappingNames(note: OverlapNote, names: CanvasNames): Record<string, string> {
    return { first: names.one(note.ids[0] ?? ""), second: names.list(note.ids.slice(1)) };
}

function movedOffNames(note: MovedShapeNote, names: CanvasNames): Record<string, string> {
    return {
        element: names.one(note.moved),
        shapes: names.list(note.ids.filter((id) => id !== note.moved)),
    };
}

/** Room made for a moved shape by shifting shapes, growing frames, or both. */
function madeRoomWording(
    note: MergeBuildNoteOfKind<"shapesOverlap"> & { readonly repair: "madeRoom" },
    names: CanvasNames,
): NoteWording {
    const replacements = {
        ...movedOffNames(note, names),
        shifted: names.list(note.shifted),
        grown: names.list(note.grown),
    };
    if (note.grown.length === 0) {
        return {
            template: "The build moved {element} off {shapes} and made room by shifting {shifted}",
            replacements,
        };
    }
    return {
        template:
            note.shifted.length === 0
                ? "The build moved {element} off {shapes} and grew {grown} to hold it"
                : "The build moved {element} off {shapes}, grew {grown} to hold it and shifted {shifted}",
        replacements,
    };
}

/** A lane the build moved below the others, with or without shifting shapes. */
function laneStackedWording(
    note: MergeBuildNoteOfKind<"lanesOverlap"> & { readonly repair: "movedByBuild" },
    names: CanvasNames,
): NoteWording {
    const replacements = { element: names.one(note.moved), grown: names.list(note.grown) };
    if (note.shifted.length === 0) {
        return {
            template: "The build moved {element} below the other lanes and grew {grown} to hold it",
            replacements,
        };
    }
    return {
        template:
            "The build moved {element} below the other lanes, grew {grown} to hold it and shifted {shifted}",
        replacements: { ...replacements, shifted: names.list(note.shifted) },
    };
}

/** The flows left out, or once it names a boundary event, the elements left out, counted as the restore offer counts. */
function restoredWithoutWording(
    note: MergeBuildNoteOfKind<"restoredWithoutRemovedWith">,
    names: CanvasNames,
): NoteWording {
    const element = names.one(note.id);
    if (note.boundaryEvents === undefined) {
        return {
            template:
                "{element} is kept without the flows the other side removed with it: {connections}",
            replacements: { element, connections: names.list(note.connections) },
        };
    }
    const elements = [...note.boundaryEvents, ...note.connections];
    return {
        template:
            elements.length === 1
                ? "{element} is kept without the boundary event the other side removed with it: {elements}"
                : "{element} is kept without the {count} elements the other side removed with it: {elements}",
        replacements: { element, count: String(elements.length), elements: names.list(elements) },
    };
}

/** A flow no diagram draws both ends of, or one that lacks an end. */
function flowNotDrawnWording(
    { id, source, target }: MergeBuildNoteOfKind<"flowNotDrawn">,
    names: CanvasNames,
): NoteWording {
    if (source === undefined || target === undefined) {
        return {
            template: "{element} is left out of the drawing: it lacks a source or a target",
            replacements: { element: names.one(id) },
        };
    }
    return {
        template:
            "{element} is left out of the drawing: no diagram shows both {source} and {target}",
        replacements: {
            element: names.one(id),
            source: names.one(source),
            target: names.one(target),
        },
    };
}
