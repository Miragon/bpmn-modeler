import type { ModdleElement } from "@miragon/bpmn-modeler-diff";

import type { BuildNote } from "./buildNotes";
import { type FlowRepair, planFlowRepairs, withFlowRepairs } from "./layoutFlowRepair";
import type { Point } from "./layoutGeometry";
import type { LayoutModel } from "./layoutModel";
import { layoutModelOf } from "./layoutModelReader";
import { writeLayoutChanges } from "./layoutRepairWriter";
import { type ShapeMovePlan, planShapeMoves } from "./layoutShapeMoves";
import { introducedLayoutSpots } from "./layoutSpotDetection";
import { layoutSpotNotes } from "./layoutSpotNotes";
import type { LayoutSpot } from "./layoutSpots";

/** How the build repairs the drawing the merge broke; the specs build with less to compare. */
export interface LayoutRepairPlanners {
    readonly moveShapes: (
        layout: LayoutModel,
        spots: readonly LayoutSpot[],
        sides: readonly LayoutModel[],
    ) => ShapeMovePlan;
    readonly repairFlows: (layout: LayoutModel, spots: readonly LayoutSpot[]) => FlowRepair[];
}

export const BUILD_LAYOUT_REPAIRS: LayoutRepairPlanners = {
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
 * Finds the broken spots of the drawing that neither side drew, moves the
 * shapes the build placed on another, then re-routes the flows still or
 * newly broken after that.
 */
export function planLayoutRepair(
    layout: LayoutModel,
    sideLayouts: readonly LayoutModel[],
    planners: LayoutRepairPlanners,
): LayoutRepairPlan {
    const spots = introducedLayoutSpots(layout, sideLayouts);
    const shapeMoves = planners.moveShapes(layout, spots, sideLayouts);
    const moved = shapeMoves.layout;
    const spotsAfterMoves = moved === layout ? spots : introducedLayoutSpots(moved, sideLayouts);
    const flowRepairs = planners.repairFlows(moved, spotsAfterMoves);
    return {
        repaired: withFlowRepairs(moved, flowRepairs),
        notes: layoutSpotNotes({
            spots,
            spotsAfterMoves,
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
    createPoint: (point: Point) => ModdleElement,
): BuildNote[] {
    const layout = layoutModelOf(definitions);
    const { repaired, notes } = planLayoutRepair(layout, sideLayouts, planners);
    writeLayoutChanges(definitions, layout, repaired, createPoint);
    return notes;
}
