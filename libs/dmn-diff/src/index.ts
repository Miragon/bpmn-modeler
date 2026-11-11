/**
 * `@miragon/dmn-modeler-diff`: compares two DMN documents in Node or the
 * browser. `computeDmnDiff` returns a serializable {@link DmnDiffResult} for the
 * DRD and each changed decision table; `dmnSideView` projects it onto one pane.
 */
export { computeDmnDiff } from "./computeDmnDiff";
export { dmnSideView } from "./dmnSideView";
export type { DecisionTableChanges, DmnDiffResult } from "./dmnDiffResult";
