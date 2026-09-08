/**
 * Diagram formatting and cleanup for the bpmn-js modeler.
 *
 * The library is split so the layers can be reasoned about separately: the
 * pure files (`types`, `port`, `preflight`, `plan`, `cleanup/rules`) import
 * nothing, `engine/` is the only place that knows the layout engine, and
 * `apply/` is the only place that knows bpmn-js.
 *
 * Register as an `additionalModule` when creating the modeler:
 * ```ts
 * import { createBpmnLayoutModule } from "@miragon/bpmn-modeler-layout";
 *
 * new BpmnModeler({ additionalModules: [createBpmnLayoutModule()] });
 * ```
 */
export { createBpmnLayoutModule } from "./module";

export type {
    Bounds,
    DiagramSnapshot,
    EdgeGeometry,
    ElementSnapshot,
    LayoutOperation,
    LayoutResult,
    Point,
    ShapeGeometry,
} from "./types";

export type { LayoutEngine } from "./port";
export { LayoutEngineError } from "./port";

export { BpmnAutoLayoutEngine } from "./engine/autoLayoutEngine";

export { LAYOUT_APPLY_COMMAND, LAYOUT_FORMATTED_EVENT, Layouter } from "./apply/Layouter";
export type { LayoutOutcome } from "./apply/Layouter";
export { CleanupService } from "./apply/CleanupService";
export { CLEANUP_COMMAND, CLEANUP_MODDLE_COMMAND } from "./apply/CleanupHandlers";

export { analyzeLayoutability } from "./preflight";
export type { PreflightModel } from "./preflight";

export { computeLayoutPlan, polylineMidpoint } from "./plan";

export {
    findCleanupCandidates,
    indexModelElements,
    isRedundantBend,
    planCleanupActions,
    tidyWaypoints,
} from "./cleanup/rules";
export type { CleanupAction, ModdleNode } from "./cleanup/rules";
