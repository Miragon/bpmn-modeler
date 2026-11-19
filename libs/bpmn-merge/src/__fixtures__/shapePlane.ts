import type { LayoutShape } from "../layoutModel";

type ShapePlane = Pick<LayoutShape, "plane" | "slot">;

/** A root plane and the result slot it goes to: its own unless the merge joins it with another. */
export function rootPlane(plane: string, slotOwner = plane): ShapePlane {
    return { plane, slot: `root:${slotOwner}` };
}

export function subProcessPlane(subProcess: string): ShapePlane {
    return { plane: subProcess, slot: `subProcess:${subProcess}` };
}
