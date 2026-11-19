import type { MergeSide } from "@miragon/bpmn-modeler-types";

/**
 * Something the last build asks the user to look at, as the merge library's
 * `BuildNote` names it. A broken spot in the drawing that neither side drew:
 * a flow that does not meet the shapes at its ends, two shapes on top of each
 * other, a flow running through shapes, a shape outside its sub-process, pool
 * or lane, a boundary event off its host's border, or two overlapping lanes;
 * a broken flow says whether the build re-routed it, two shapes on top of
 * each other which one the build moved and what it shifted to make room, a
 * shape outside its containers whether the build moved it inside or grew
 * one to hold it, and what it shifted then, and overlapping lanes which lane
 * the build moved below the others and which pool it grew.
 * Or an element kept without the boundary events or flows removed with it, a
 * kept flow its source no longer names as its default (with the default it
 * keeps, if any), elements whose layout both sides changed differently with
 * the side the result keeps, a part of the file's `definitions` that
 * differs between the sides, of which the result keeps current's, or a flow
 * left out of the drawing since no diagram draws both its ends.
 */
export type MergePaneBuildNote =
    | {
          /** A flow and the shapes it misses at its ends or runs through, with whether the build re-routed it. */
          readonly kind: "flowEndOffShape" | "flowThroughShape";
          readonly id: string;
          readonly shapes: readonly string[];
          readonly repair: "movedByBuild" | "notRepaired";
      }
    | ({
          /** A shape and the containers it lies outside, with whether the build moved it inside or grew one to hold it. */
          readonly kind: "shapeOutsideContainer";
          readonly id: string;
          readonly shapes: readonly string[];
      } & (
          | { readonly repair: "movedIntoContainer" }
          | { readonly repair: "grewContainer" }
          | { readonly repair: "grewContainerAndShifted"; readonly shifted: readonly string[] }
          | { readonly repair: "notRepaired" }
      ))
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
    | ({
          /** Lanes of one pool on top of each other, with the lane the build moved below the others and the pool it grew. */
          readonly kind: "lanesOverlap";
          readonly ids: readonly string[];
      } & (
          | { readonly repair: "movedByBuild"; readonly moved: string; readonly pool: string }
          | { readonly repair: "notRepaired" }
      ))
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
    | { readonly kind: "frameDiffers"; readonly attribute: string }
    | {
          /** A flow left out of the drawing, since no plane draws both its ends, with the ends it has. */
          readonly kind: "flowNotDrawn";
          readonly id: string;
          readonly source?: string;
          readonly target?: string;
      };
