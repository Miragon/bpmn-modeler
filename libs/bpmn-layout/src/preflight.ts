import type { LayoutErrorCode } from "@miragon/bpmn-modeler-types";

/**
 * What the pre-flight check needs to know about the surface it is about to
 * format. Structural, so the caller decides how to derive each fact.
 */
export interface PreflightModel {
    /** False on the read-only viewer, which has neither `modeling` nor `commandStack`. */
    editable: boolean;
    /** False while drilled into a subprocess plane — the engine lays out the whole definitions tree. */
    topLevelPlane: boolean;
    /** BPMN elements on the diagram, excluding labels and the root. */
    elementCount: number;
}

/**
 * Decides whether formatting may run at all.
 *
 * This is our own gate, deliberately independent of the engine: it must hold
 * even when a future engine version starts accepting cases we refuse today.
 *
 * @returns The refusal reason, or `undefined` when the diagram may be formatted.
 */
export function analyzeLayoutability(model: PreflightModel): LayoutErrorCode | undefined {
    if (!model.editable) return "UNSUPPORTED_SURFACE";
    if (!model.topLevelPlane) return "UNSUPPORTED_DRILLDOWN";
    if (model.elementCount === 0) return "EMPTY_DIAGRAM";
    return undefined;
}
