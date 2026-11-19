import type { MergePaneBuildNote } from "@miragon/bpmn-modeler-shared";
import type { MergeSide } from "@miragon/bpmn-modeler-types";

import type { MergeTranslate } from "./mergeTranslate";

type NoteOfKind<Kind extends MergePaneBuildNote["kind"]> = Extract<
    MergePaneBuildNote,
    { kind: Kind }
>;

/** A broken flow's note: the only notes that say whether the build repaired them. */
type FlowNote = Extract<MergePaneBuildNote, { repair: unknown }>;

/** What each build note asks the user to check, with the canvas's names of its elements; each is a translation key. */
const BUILD_NOTE_TEXTS: Record<
    Exclude<MergePaneBuildNote["kind"], "layoutChangedByBoth" | FlowNote["kind"]>,
    string
> = {
    shapesOverlap: "{first} and {second} lie on top of each other",
    shapeOutsideContainer: "{element} lies outside {shapes}",
    boundaryEventOffHost: "{element} is not on the border of {host}",
    lanesOverlap: "{first} and {second} overlap",
    restoredWithoutRemovedWith:
        "{element} is kept without the flows the other side removed with it: {connections}",
    defaultFlowNotRestored: "{flow} is kept but is no longer the default flow of {element}",
    frameDiffers: "The file's {attribute} differs between the sides; current's is kept",
    flowNotDrawn:
        "{element} is left out of the drawing: no diagram shows both {source} and {target}",
};

/** A broken flow's note, by whether the build re-routed it. */
const FLOW_NOTE_TEXTS: Record<FlowNote["kind"], Record<FlowNote["repair"], string>> = {
    flowEndOffShape: {
        movedByBuild: "The build moved {element} to meet {shapes}",
        notRepaired: "{element} does not meet {shapes}; the build could not repair it",
    },
    flowThroughShape: {
        movedByBuild: "The build moved {element} around {shapes}",
        notRepaired: "{element} runs through {shapes}; the build could not repair it",
    },
};

const OTHER_DEFAULT_KEPT_TEXT =
    "{flow} is kept, but {element} keeps {keptDefault} as its default flow";

/** `restoredWithoutRemovedWith` once it names a boundary event, counted as the restore offer counts. */
const RESTORED_WITHOUT_ELEMENTS_TEXTS = {
    boundaryEvent:
        "{element} is kept without the boundary event the other side removed with it: {elements}",
    elements:
        "{element} is kept without the {count} elements the other side removed with it: {elements}",
};

const LAYOUT_CHANGED_BY_BOTH_TEXTS: Record<MergeSide, string> = {
    current: "Both sides changed the layout of {elements}; current's is kept",
    incoming: "Both sides changed the layout of {elements}; incoming's is kept",
};

/** One note of the last build, in one line. */
export function buildNoteText(
    note: MergePaneBuildNote,
    nameOf: (id: string) => string,
    translate: MergeTranslate,
): string {
    const names = (ids: readonly string[]) => ids.map(nameOf).join(", ");
    return translate(buildNoteTemplate(note), noteReplacements(note, nameOf, names));
}

function buildNoteTemplate(note: MergePaneBuildNote): string {
    if (note.kind === "layoutChangedByBoth") return LAYOUT_CHANGED_BY_BOTH_TEXTS[note.keptSide];
    if ("repair" in note) return FLOW_NOTE_TEXTS[note.kind][note.repair];
    if (note.kind === "defaultFlowNotRestored" && note.keptDefault !== undefined) {
        return OTHER_DEFAULT_KEPT_TEXT;
    }
    if (note.kind === "restoredWithoutRemovedWith" && note.boundaryEvents !== undefined) {
        return restoredWithoutElementsOf(note).length === 1
            ? RESTORED_WITHOUT_ELEMENTS_TEXTS.boundaryEvent
            : RESTORED_WITHOUT_ELEMENTS_TEXTS.elements;
    }
    return BUILD_NOTE_TEXTS[note.kind];
}

function restoredWithoutElementsOf(
    note: NoteOfKind<"restoredWithoutRemovedWith">,
): readonly string[] {
    return [...(note.boundaryEvents ?? []), ...note.connections];
}

function restoredWithoutReplacements(
    note: NoteOfKind<"restoredWithoutRemovedWith">,
    nameOf: (id: string) => string,
    names: (ids: readonly string[]) => string,
): Record<string, string> {
    if (note.boundaryEvents === undefined) {
        return { element: nameOf(note.id), connections: names(note.connections) };
    }
    const elements = restoredWithoutElementsOf(note);
    return { element: nameOf(note.id), count: String(elements.length), elements: names(elements) };
}

function defaultFlowNoteReplacements(
    note: NoteOfKind<"defaultFlowNotRestored">,
    nameOf: (id: string) => string,
): Record<string, string> {
    const replacements = { element: nameOf(note.id), flow: nameOf(note.flow) };
    return note.keptDefault === undefined
        ? replacements
        : { ...replacements, keptDefault: nameOf(note.keptDefault) };
}

function noteReplacements(
    note: MergePaneBuildNote,
    nameOf: (id: string) => string,
    names: (ids: readonly string[]) => string,
): Record<string, string> {
    switch (note.kind) {
        case "flowEndOffShape":
        case "flowThroughShape":
        case "shapeOutsideContainer":
            return { element: nameOf(note.id), shapes: names(note.shapes) };
        case "shapesOverlap":
        case "lanesOverlap":
            return { first: nameOf(note.ids[0] ?? ""), second: names(note.ids.slice(1)) };
        case "boundaryEventOffHost":
            return { element: nameOf(note.id), host: nameOf(note.host) };
        case "restoredWithoutRemovedWith":
            return restoredWithoutReplacements(note, nameOf, names);
        case "defaultFlowNotRestored":
            return defaultFlowNoteReplacements(note, nameOf);
        case "layoutChangedByBoth":
            return { elements: names(note.ids) };
        case "frameDiffers":
            return { attribute: note.attribute };
        case "flowNotDrawn":
            return {
                element: nameOf(note.id),
                source: nameOf(note.ends[0] ?? ""),
                target: names(note.ends.slice(1)),
            };
    }
}
