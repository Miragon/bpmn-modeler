import type {
    MergeBrokenFlowKind,
    MergeBuildNoteContent,
    MergeSide,
} from "@miragon/bpmn-modeler-types";

import type { MergeTranslate } from "./mergeTranslate";

type NoteOfKind<Kind extends MergeBuildNoteContent["kind"]> = Extract<
    MergeBuildNoteContent,
    { kind: Kind }
>;

/** A broken flow's note, which says whether the build re-routed the flow. */
type FlowNote = NoteOfKind<MergeBrokenFlowKind>;

type OverlapNote = NoteOfKind<"shapesOverlap">;

type ContainerNote = NoteOfKind<"shapeOutsideContainer">;

type LaneNote = NoteOfKind<"lanesOverlap">;

/** What each build note asks the user to check, with the canvas's names of its elements; each is a translation key. */
const BUILD_NOTE_TEXTS: Record<
    Exclude<
        MergeBuildNoteContent["kind"],
        | "layoutChangedByBoth"
        | FlowNote["kind"]
        | OverlapNote["kind"]
        | ContainerNote["kind"]
        | LaneNote["kind"]
    >,
    string
> = {
    boundaryEventOffHost: "{element} is not on the border of {host}",
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

/** Two shapes on top of each other, by what the build did about them. */
const OVERLAP_NOTE_TEXTS: Record<OverlapNote["repair"], string> = {
    movedByBuild: "The build moved {element} off {shapes}",
    madeRoom: "The build moved {element} off {shapes} and made room by shifting {shifted}",
    notRepaired: "{first} and {second} lie on top of each other; the build could not repair it",
};

/** Room made by growing frames, with or without shifting shapes, by what it shifted. */
const ROOM_GROWN_TEXTS = {
    grown: "The build moved {element} off {shapes} and grew {grown} to hold it",
    grownAndShifted:
        "The build moved {element} off {shapes}, grew {grown} to hold it and shifted {shifted}",
};

/** A shape outside its containers, by what the build did about it. */
const CONTAINER_NOTE_TEXTS: Record<ContainerNote["repair"], string> = {
    movedIntoContainer: "The build moved {element} into {shapes}",
    grewContainer: "The build grew {shapes} to hold {element}",
    grewContainerAndShifted: "The build grew {shapes} to hold {element} and shifted {shifted}",
    notRepaired: "{element} lies outside {shapes}; the build could not repair it",
};

/** Lanes of one pool on top of each other, or a lane outside its pool, by what the build did about them. */
const LANE_NOTE_TEXTS: Record<LaneNote["repair"], string> = {
    movedByBuild: "The build moved {element} below the other lanes and grew {grown} to hold it",
    notRepaired: "{first} and {second} overlap; the build could not repair it",
};

const LANE_MOVED_AND_SHIFTED_TEXT =
    "The build moved {element} below the other lanes, grew {grown} to hold it and shifted {shifted}";

const FLOW_WITHOUT_END_TEXT = "{element} is left out of the drawing: it lacks a source or a target";

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
    note: MergeBuildNoteContent,
    nameOf: (id: string) => string,
    translate: MergeTranslate,
): string {
    const names = (ids: readonly string[]) => ids.map(nameOf).join(", ");
    return translate(buildNoteTemplate(note), noteReplacements(note, nameOf, names));
}

function buildNoteTemplate(note: MergeBuildNoteContent): string {
    if (note.kind === "layoutChangedByBoth") return LAYOUT_CHANGED_BY_BOTH_TEXTS[note.keptSide];
    if (note.kind === "shapesOverlap") return overlapTemplate(note);
    if (note.kind === "shapeOutsideContainer") return CONTAINER_NOTE_TEXTS[note.repair];
    if (note.kind === "lanesOverlap") {
        return note.repair === "movedByBuild" && note.shifted.length > 0
            ? LANE_MOVED_AND_SHIFTED_TEXT
            : LANE_NOTE_TEXTS[note.repair];
    }
    if ("repair" in note) return FLOW_NOTE_TEXTS[note.kind][note.repair];
    if (note.kind === "defaultFlowNotRestored" && note.keptDefault !== undefined) {
        return OTHER_DEFAULT_KEPT_TEXT;
    }
    if (note.kind === "flowNotDrawn" && lacksAnEnd(note)) return FLOW_WITHOUT_END_TEXT;
    if (note.kind === "restoredWithoutRemovedWith" && note.boundaryEvents !== undefined) {
        return restoredWithoutElementsOf(note).length === 1
            ? RESTORED_WITHOUT_ELEMENTS_TEXTS.boundaryEvent
            : RESTORED_WITHOUT_ELEMENTS_TEXTS.elements;
    }
    return BUILD_NOTE_TEXTS[note.kind];
}

function overlapTemplate(note: OverlapNote): string {
    if (note.repair !== "madeRoom" || note.grown.length === 0) {
        return OVERLAP_NOTE_TEXTS[note.repair];
    }
    return note.shifted.length === 0 ? ROOM_GROWN_TEXTS.grown : ROOM_GROWN_TEXTS.grownAndShifted;
}

function lacksAnEnd({ source, target }: NoteOfKind<"flowNotDrawn">): boolean {
    return source === undefined || target === undefined;
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

function overlapReplacements(
    note: OverlapNote,
    nameOf: (id: string) => string,
    names: (ids: readonly string[]) => string,
): Record<string, string> {
    if (note.repair === "notRepaired") {
        return { first: nameOf(note.ids[0] ?? ""), second: names(note.ids.slice(1)) };
    }
    const moved = {
        element: nameOf(note.moved),
        shapes: names(note.ids.filter((id) => id !== note.moved)),
    };
    if (note.repair !== "madeRoom") return moved;
    return { ...moved, shifted: names(note.shifted), grown: names(note.grown) };
}

function laneReplacements(
    note: LaneNote,
    nameOf: (id: string) => string,
    names: (ids: readonly string[]) => string,
): Record<string, string> {
    if (note.repair === "notRepaired") {
        return { first: nameOf(note.ids[0] ?? ""), second: names(note.ids.slice(1)) };
    }
    const moved = { element: nameOf(note.moved), grown: names(note.grown) };
    return note.shifted.length > 0 ? { ...moved, shifted: names(note.shifted) } : moved;
}

function noteReplacements(
    note: MergeBuildNoteContent,
    nameOf: (id: string) => string,
    names: (ids: readonly string[]) => string,
): Record<string, string> {
    switch (note.kind) {
        case "flowEndOffShape":
        case "flowThroughShape":
            return { element: nameOf(note.id), shapes: names(note.shapes) };
        case "shapeOutsideContainer":
            return {
                element: nameOf(note.id),
                shapes: names(note.shapes),
                ...(note.repair === "grewContainerAndShifted"
                    ? { shifted: names(note.shifted) }
                    : {}),
            };
        case "shapesOverlap":
            return overlapReplacements(note, nameOf, names);
        case "lanesOverlap":
            return laneReplacements(note, nameOf, names);
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
            return lacksAnEnd(note)
                ? { element: nameOf(note.id) }
                : {
                      element: nameOf(note.id),
                      source: nameOf(note.source ?? ""),
                      target: nameOf(note.target ?? ""),
                  };
    }
}
