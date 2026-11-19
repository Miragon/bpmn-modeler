import type { MergeSide } from "@miragon/bpmn-modeler-types";

/**
 * Something the last build asks the user to look at, as the merge library's
 * `BuildNote` names it. A broken spot in the drawing that neither side drew:
 * a flow that does not meet the shapes at its ends, two shapes on top of each
 * other, a flow running through shapes, a shape outside its sub-process, pool
 * or lane, a boundary event off its host's border, or two overlapping lanes;
 * a broken flow says whether the build re-routed it, two shapes on top of
 * each other which one the build moved and what it shifted to make room.
 * Or an element kept without the boundary events or flows removed with it, a
 * kept flow its source no longer names as its default (with the default it
 * keeps, if any), elements whose layout both sides changed differently with
 * the side the result keeps, or a part of the file's `definitions` that
 * differs between the sides, of which the result keeps current's.
 */
export type MergePaneBuildNote =
    | {
          /** A flow and the shapes it misses at its ends or runs through, with whether the build re-routed it. */
          readonly kind: "flowEndOffShape" | "flowThroughShape";
          readonly id: string;
          readonly shapes: readonly string[];
          readonly repair: "movedByBuild" | "notRepaired";
      }
    | {
          /** A shape and the containers it lies outside. */
          readonly kind: "shapeOutsideContainer";
          readonly id: string;
          readonly shapes: readonly string[];
      }
    | ({
          /** Two shapes on top of each other, with which the build moved and what it shifted to make room. */
          readonly kind: "shapesOverlap";
          readonly ids: readonly string[];
      } & (
          | { readonly repair: "movedByBuild"; readonly moved: string }
          | {
                readonly repair: "madeRoom";
                readonly moved: string;
                readonly shifted: readonly string[];
            }
          | { readonly repair: "notRepaired" }
      ))
    | { readonly kind: "boundaryEventOffHost"; readonly id: string; readonly host: string }
    | { readonly kind: "lanesOverlap"; readonly ids: readonly string[] }
    | {
          readonly kind: "restoredWithoutRemovedWith";
          readonly id: string;
          readonly connections: readonly string[];
          readonly boundaryEvents?: readonly string[];
      }
    | {
          readonly kind: "defaultFlowNotRestored";
          readonly id: string;
          readonly flow: string;
          readonly keptDefault?: string;
      }
    | {
          readonly kind: "layoutChangedByBoth";
          readonly ids: readonly string[];
          readonly keptSide: MergeSide;
      }
    | { readonly kind: "frameDiffers"; readonly attribute: string };
