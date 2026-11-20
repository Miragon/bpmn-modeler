import type { MergeSide } from "./mergeVocabulary";

/** A flow the merge broke: one that misses a shape at its ends, or one that runs through a shape. */
export type MergeBrokenFlowKind = "flowEndOffShape" | "flowThroughShape";

/** What the build did about a broken flow: re-routed it onto its shapes, or left it as drawn. */
export type MergeFlowRepair = "movedByBuild" | "notRepaired";

/** Whether the build brought a shape into its containers or grew one to hold it, and what it shifted then. */
export type MergeContainerRepair =
    | { readonly repair: "movedIntoContainer" }
    | { readonly repair: "grewContainer" }
    | {
          readonly repair: "grewContainerAndShifted";
          /** The outermost shapes shifted to make room for the grown container, in document order. */
          readonly shifted: readonly string[];
      }
    | { readonly repair: "notRepaired" };

/**
 * Which of two shapes on top of each other the build moved, and whether it shifted shapes, grew frames or did both to
 * make room. `shifted` lists the outermost shapes shifted, `grown` the sub-processes, lanes and pools grown to hold
 * the moved shape, each in document order.
 */
export type MergeOverlapRepair =
    | { readonly repair: "movedByBuild"; readonly moved: string }
    | {
          readonly repair: "madeRoomByShifting";
          readonly moved: string;
          readonly shifted: readonly string[];
      }
    | {
          readonly repair: "madeRoomByGrowing";
          readonly moved: string;
          readonly grown: readonly string[];
      }
    | {
          readonly repair: "madeRoomByGrowingAndShifting";
          readonly moved: string;
          readonly shifted: readonly string[];
          readonly grown: readonly string[];
      }
    | { readonly repair: "notRepaired" };

/**
 * Whether the build moved a lane below the others, with the pool and parent lanes it grew to hold it, and whether it
 * shifted shapes down.
 */
type MergeLaneRepair =
    | {
          readonly repair: "movedByBuild";
          readonly moved: string;
          readonly grown: readonly string[];
      }
    | {
          readonly repair: "movedByBuildAndShifted";
          readonly moved: string;
          readonly grown: readonly string[];
          readonly shifted: readonly string[];
      }
    | { readonly repair: "notRepaired" };

/**
 * Something the last build asks the user to look at. A broken spot in the
 * drawing that neither side drew: a flow that does not meet the shapes at its
 * ends, two shapes on top of each other, a flow running through shapes, a
 * shape outside its sub-process, pool or lane, a boundary event off its
 * host's border, or two overlapping lanes, each with what the build did about
 * it. Or an element kept without the boundary events or flows removed with
 * it, a kept flow its source no longer names as its default, elements whose
 * layout both sides changed differently with the side the result keeps, a
 * part of the file's `definitions` that differs between the sides, of which
 * the result keeps current's, or a flow left out of the drawing since no
 * diagram draws both its ends.
 */
export type MergeBuildNoteContent =
    | {
          /** A flow and the shapes it misses at its ends or runs through, with whether the build re-routed it. */
          readonly kind: MergeBrokenFlowKind;
          readonly id: string;
          readonly shapes: readonly string[];
          readonly repair: MergeFlowRepair;
      }
    | ({
          /** A shape and the containers it lies outside, with what the build did about it. */
          readonly kind: "shapeOutsideContainer";
          readonly id: string;
          readonly shapes: readonly string[];
      } & MergeContainerRepair)
    | ({
          /** Two shapes on top of each other, with what the build did about them. */
          readonly kind: "shapesOverlap";
          readonly ids: readonly string[];
      } & MergeOverlapRepair)
    | { readonly kind: "boundaryEventOffHost"; readonly id: string; readonly host: string }
    | ({
          /**
           * Lanes of one pool on top of each other, or a lane the build moved into its pool, with the lane it moved
           * below the others, the pool and parent lanes it grew and the shapes it shifted down.
           */
          readonly kind: "lanesOverlap";
          readonly ids: readonly string[];
      } & MergeLaneRepair)
    | {
          readonly kind: "restoredWithoutRemovedWith";
          readonly id: string;
          readonly connections: readonly string[];
          /** The boundary events the other side removed with the element that the result leaves out. */
          readonly boundaryEvents?: readonly string[];
      }
    | {
          readonly kind: "defaultFlowNotRestored";
          readonly id: string;
          readonly flow: string;
          /** The default the source keeps instead; none when it keeps no default. */
          readonly keptDefault?: string;
      }
    | {
          readonly kind: "layoutChangedByBoth";
          readonly ids: readonly string[];
          readonly keptSide: MergeSide;
      }
    | { readonly kind: "frameDiffers"; readonly attribute: string }
    | {
          /** A flow left out of the drawing, since no plane draws both its ends, with the ends it has. */
          readonly kind: "flowNotDrawn";
          readonly id: string;
          readonly source?: string;
          readonly target?: string;
      };

/** The note of one kind; a broken flow's note, whose kind is either broken-flow kind, included. */
export type MergeBuildNoteOfKind<Kind extends MergeBuildNoteContent["kind"]> =
    MergeBuildNoteContent extends infer Note
        ? Note extends { readonly kind: infer KindOfNote }
            ? Kind extends KindOfNote
                ? Note & { readonly kind: Kind }
                : never
            : never
        : never;

/** The kinds of note that record what the build did about them. */
export type MergeRepairedNoteKind = Extract<MergeBuildNoteContent, { repair: string }>["kind"];

/** The repairs a note can record. */
export type MergeNoteRepairOf<Note> = Note extends { readonly repair: infer Repair extends string }
    ? Repair
    : never;

/** A build note with the elements it names, in the order its entry offers them. */
export type MergeBuildNote = MergeBuildNoteContent & { readonly named: readonly string[] };

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
export function shapesShiftedBy(note: MergeBuildNoteContent): readonly string[] {
    return "shifted" in note ? note.shifted : [];
}

/** The frames a note's repair grew to hold what it moved; none for a repair that grew nothing. */
export function framesGrownBy(note: MergeBuildNoteContent): readonly string[] {
    return "grown" in note ? note.grown : [];
}
