import type { ModdleElement } from "@miragon/bpmn-modeler-diff/domain";

import type { BuildNoteContent } from "../buildNotes";
import { type ContainerMovePlan, planContainerMoves } from "./layoutContainerMoves";
import { type FlowRepairPlanner, planFlowRepairs, withFlowRepairs } from "./layoutFlowRepair";
import type { Point } from "./layoutGeometry";
import { type LaneStackPlan, stackAppendedLanes } from "./layoutLaneStacking";
import type { LayoutModel } from "./layoutModel";
import { IndexedDocument } from "../indexedDocument";
import { layoutModelOfDocument } from "./layoutModelReader";
import { placeBesideNeighbours } from "./layoutNeighbourPlacement";
import { writeLayoutChanges } from "./layoutRepairWriter";
import { type ShapeMovePlan, planShapeMoves } from "./layoutShapeMoves";
import type { PlaneSlots } from "../planeSlots";
import { introducedLayoutSpots } from "./layoutSpotDetection";
import { layoutSpotNotes } from "./layoutSpotNotes";
import { flowSpotRepairs } from "./layoutSpotRepairs";
import type { LayoutSpot } from "./layoutSpots";

/** How the build repairs the drawing the merge broke; the specs build with less to compare. */
export interface LayoutRepairPlanners {
    readonly placeBesideNeighbours: (
        layout: LayoutModel,
        sides: readonly LayoutModel[],
    ) => LayoutModel;
    readonly stackLanes: (layout: LayoutModel, appendedLanes: readonly string[]) => LaneStackPlan;
    readonly moveIntoContainers: (
        layout: LayoutModel,
        spots: readonly LayoutSpot[],
        sides: readonly LayoutModel[],
    ) => ContainerMovePlan;
    readonly moveShapes: (
        layout: LayoutModel,
        spots: readonly LayoutSpot[],
        sides: readonly LayoutModel[],
        repairFlows: FlowRepairPlanner,
        framing?: LayoutModel,
    ) => ShapeMovePlan;
    readonly repairFlows: FlowRepairPlanner;
}

export const BUILD_LAYOUT_REPAIRS: LayoutRepairPlanners = {
    placeBesideNeighbours,
    stackLanes: stackAppendedLanes,
    moveIntoContainers: planContainerMoves,
    moveShapes: planShapeMoves,
    repairFlows: planFlowRepairs,
};

export interface LayoutRepairPlan {
    /** The drawing with every repair applied; the input itself when nothing changed. */
    readonly repaired: LayoutModel;
    /** The spots' notes, read before the repair. */
    readonly notes: BuildNoteContent[];
}

/**
 * Keeps the shapes only one side draws beside the flow neighbours that side
 * drew them at, finds the broken spots of the drawing that neither side drew, stacks the
 * appended lanes their pool's lanes do not hold below them, brings the
 * shapes the build placed outside their containers back inside, moves the
 * shapes it placed on another, then re-routes the flows still or newly
 * broken after that.
 */
export function planLayoutRepair(
    assembled: LayoutModel,
    sideLayouts: readonly LayoutModel[],
    planners: LayoutRepairPlanners,
    appendedLanes: readonly string[],
    framing?: LayoutModel,
): LayoutRepairPlan {
    const spotsAfter = (step: LayoutModel, before: LayoutModel, spotsBefore: LayoutSpot[]) =>
        step === before ? spotsBefore : introducedLayoutSpots(step, sideLayouts);
    const layout = planners.placeBesideNeighbours(assembled, sideLayouts);
    const assembledSpots = introducedLayoutSpots(layout, sideLayouts);
    const laneStacks = planners.stackLanes(layout, appendedLanes);
    const stacked = laneStacks.layout;
    const spots = spotsAfter(stacked, layout, assembledSpots);
    const containerMoves = planners.moveIntoContainers(stacked, spots, sideLayouts);
    const inContainers = containerMoves.layout;
    const spotsInContainers = spotsAfter(inContainers, stacked, spots);
    const shapeMoves = planners.moveShapes(
        inContainers,
        spotsInContainers,
        sideLayouts,
        planners.repairFlows,
        framing,
    );
    const moved = shapeMoves.layout;
    const spotsAfterMoves = spotsAfter(moved, inContainers, spotsInContainers);
    const flowRepairs = planners.repairFlows(moved, spotsAfterMoves);
    return {
        repaired: withFlowRepairs(moved, flowRepairs),
        notes: layoutSpotNotes({
            laneStackings: laneStacks.stacked,
            spots,
            spotsAfterMoves,
            repairs: [
                ...containerMoves.repairs,
                ...shapeMoves.repairs,
                ...flowSpotRepairs(spotsAfterMoves, flowRepairs),
            ],
        }),
    };
}

/** Plans the repair of the assembled drawing, read in the sides' plane slots, writes it into the drawing and returns its notes. */
export function repairIntroducedSpots(
    definitions: ModdleElement,
    sideLayouts: readonly LayoutModel[],
    slots: PlaneSlots,
    planners: LayoutRepairPlanners,
    appendedLanes: readonly string[],
    createPoint: (point: Point) => ModdleElement,
    framing?: LayoutModel,
): BuildNoteContent[] {
    const document = IndexedDocument.of(definitions);
    const layout = layoutModelOfDocument(document, slots);
    const { repaired, notes } = planLayoutRepair(
        layout,
        sideLayouts,
        planners,
        appendedLanes,
        framing,
    );
    writeLayoutChanges(document.index, layout, repaired, createPoint);
    return notes;
}
