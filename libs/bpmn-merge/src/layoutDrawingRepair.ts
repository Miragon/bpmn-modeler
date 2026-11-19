import type { ModdleElement } from "@miragon/bpmn-modeler-diff";

import type { BuildNote } from "./buildNotes";
import type { FlowRepair } from "./layoutFlowRepair";
import type { Point } from "./layoutGeometry";
import type { LayoutModel } from "./layoutModel";
import { layoutModelOf } from "./layoutModelReader";
import { writeFlowRepairs } from "./layoutRepairWriter";
import { introducedLayoutSpots } from "./layoutSpotDetection";
import { layoutSpotNotes } from "./layoutSpotNotes";
import type { LayoutSpot } from "./layoutSpots";

/** How the build repairs the flows the merge broke; the specs build without it to compare. */
export type FlowRepairPlanner = (layout: LayoutModel, spots: readonly LayoutSpot[]) => FlowRepair[];

/**
 * Finds the broken spots of the assembled drawing that neither side drew,
 * writes the planned flow repairs into it and returns the spots' notes, read
 * before the repair.
 */
export function repairIntroducedSpots(
    definitions: ModdleElement,
    sideLayouts: readonly LayoutModel[],
    planRepairs: FlowRepairPlanner,
    createPoint: (point: Point) => ModdleElement,
): BuildNote[] {
    const layout = layoutModelOf(definitions);
    const spots = introducedLayoutSpots(layout, sideLayouts);
    const repairs = planRepairs(layout, spots);
    writeFlowRepairs(definitions, repairs, createPoint);
    return layoutSpotNotes(spots, repairs);
}
