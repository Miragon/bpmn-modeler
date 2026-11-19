import type { ModdleElement } from "@miragon/bpmn-modeler-diff";

import type { BuildNote } from "./buildNotes";
import { type ContainerMovePlan, planContainerMoves } from "./layoutContainerMoves";
import { type FlowRepair, planFlowRepairs, withFlowRepairs } from "./layoutFlowRepair";
import type { Point } from "./layoutGeometry";
import { type LaneStackPlan, stackAppendedLanes } from "./layoutLaneStacking";
import type { LayoutModel } from "./layoutModel";
import { layoutModelOf } from "./layoutModelReader";
import { writeLayoutChanges } from "./layoutRepairWriter";
import { type ShapeMovePlan, planShapeMoves } from "./layoutShapeMoves";
import { introducedLayoutSpots } from "./layoutSpotDetection";
import { layoutSpotNotes } from "./layoutSpotNotes";
import type { LayoutSpot } from "./layoutSpots";

/** How the build repairs the drawing the merge broke; the specs build with less to compare. */
export interface LayoutRepairPlanners {
    readonly stackLanes: (
        layout: LayoutModel,
        spots: readonly LayoutSpot[],
        appendedLanes: readonly string[],
    ) => LaneStackPlan;
    readonly moveIntoContainers: (
        layout: LayoutModel,
        spots: readonly LayoutSpot[],
        sides: readonly LayoutModel[],
    ) => ContainerMovePlan;
    readonly moveShapes: (
        layout: LayoutModel,
        spots: readonly LayoutSpot[],
        sides: readonly LayoutModel[],
    ) => ShapeMovePlan;
    readonly repairFlows: (layout: LayoutModel, spots: readonly LayoutSpot[]) => FlowRepair[];
}

export const BUILD_LAYOUT_REPAIRS: LayoutRepairPlanners = {
    stackLanes: stackAppendedLanes,
    moveIntoContainers: planContainerMoves,
    moveShapes: planShapeMoves,
    repairFlows: planFlowRepairs,
};

export interface LayoutRepairPlan {
    /** The drawing with every repair applied; the input itself when nothing changed. */
    readonly repaired: LayoutModel;
    /** The spots' notes, read before the repair. */
    readonly notes: BuildNote[];
}

/**
 * Finds the broken spots of the drawing that neither side drew, stacks the
 * appended lanes that lie on their pool's lanes below them, brings the
 * shapes the build placed outside their containers back inside, moves the
 * shapes it placed on another, then re-routes the flows still or newly
 * broken after that.
 */
export function planLayoutRepair(
    layout: LayoutModel,
    sideLayouts: readonly LayoutModel[],
    planners: LayoutRepairPlanners,
    appendedLanes: readonly string[],
): LayoutRepairPlan {
    const assembledSpots = introducedLayoutSpots(layout, sideLayouts);
    const laneStacks = planners.stackLanes(layout, assembledSpots, appendedLanes);
    const stacked = laneStacks.layout;
    const spots = stacked === layout ? assembledSpots : introducedLayoutSpots(stacked, sideLayouts);
    const containerMoves = planners.moveIntoContainers(stacked, spots, sideLayouts);
    const inContainers = containerMoves.layout;
    const spotsInContainers =
        inContainers === stacked ? spots : introducedLayoutSpots(inContainers, sideLayouts);
    const shapeMoves = planners.moveShapes(inContainers, spotsInContainers, sideLayouts);
    const moved = shapeMoves.layout;
    const spotsAfterMoves =
        moved === inContainers ? spotsInContainers : introducedLayoutSpots(moved, sideLayouts);
    const flowRepairs = planners.repairFlows(moved, spotsAfterMoves);
    return {
        repaired: withFlowRepairs(moved, flowRepairs),
        notes: layoutSpotNotes({
            laneStackings: laneStacks.stacked,
            spots,
            spotsAfterMoves,
            containerRepairs: containerMoves.repairs,
            shapesMovedForContainers: containerMoves.movedShapes,
            overlapRepairs: shapeMoves.repairs,
            flowRepairs,
        }),
    };
}

/** Plans the repair of the assembled drawing, writes it into the drawing and returns its notes. */
export function repairIntroducedSpots(
    definitions: ModdleElement,
    sideLayouts: readonly LayoutModel[],
    planners: LayoutRepairPlanners,
    appendedLanes: readonly string[],
    createPoint: (point: Point) => ModdleElement,
): BuildNote[] {
    const layout = layoutModelOf(definitions);
    const { repaired, notes } = planLayoutRepair(layout, sideLayouts, planners, appendedLanes);
    writeLayoutChanges(definitions, layout, repaired, createPoint);
    return notes;
}
