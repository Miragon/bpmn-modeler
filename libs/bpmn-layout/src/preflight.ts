import type { LayoutErrorCode } from "@miragon/bpmn-modeler-types";

/**
 * What the pre-flight check needs to know about the surface it is about to
 * format. Structural, so the caller decides how to derive each fact.
 */
export interface PreflightModel {
    /** False on the read-only viewer, which has neither `modeling` nor `commandStack`. */
    editable: boolean;
    /** BPMN elements across every plane, excluding labels and plane roots. */
    elementCount: number;
}

/**
 * Decides whether formatting may run at all.
 *
 * Only conditions under which formatting is *meaningless* belong here — a
 * surface that cannot be modelled on, and a diagram with nothing on it. Which
 * plane is open is deliberately not one of them; the registry spans planes.
 *
 * @returns The refusal reason, or `undefined` when the diagram may be formatted.
 */
export function analyzeLayoutability(model: PreflightModel): LayoutErrorCode | undefined {
    if (!model.editable) return "UNSUPPORTED_SURFACE";
    if (model.elementCount === 0) return "EMPTY_DIAGRAM";
    return undefined;
}
