/**
 * `@miragon/bpmn-modeler-diff` — the host-agnostic, Node- and browser-safe data
 * layer for BPMN diffing.
 *
 * `computeDiff(beforeXml, afterXml)` parses and compares two BPMN documents and
 * returns a serializable {@link DiffResult}; `sideView` projects that result
 * onto one pane's canvas; `elementXml` cuts one element's XML for a text diff;
 * `loadBpmnModdle` is the one lazy loader of the bpmn-moddle parser for every
 * workspace that parses BPMN without bpmn-js, and `moddleDescriptor` unwraps the
 * descriptors it is given. The package touches no DOM, no CSS, and no bpmn-js —
 * it is inlined into the publishable `@miragon/bpmn-modeler` under its `./diff`
 * subpath and imported directly by the extension engine (`modeler-core`).
 */
export { computeDiff } from "./computeDiff";
export { sideView } from "./sideView";
export { elementXml } from "./elementXml";
export { loadBpmnModdle, moddleDescriptor } from "./bpmnModdleFactory";
export type { BpmnModdleFactory } from "./bpmnModdleFactory";
export { layoutOnlyEdgeIds } from "./drawnEdges";
export type { DiffSide, DiffCounts, DiffCategory, DiffResult, DiffSideView } from "./diffResult";
export { buildFlowOrder, buildRemovedAnchors, sortIdsByOrder } from "./bpmnFlowOrder";
export type { ModdleElement, FlowPosition } from "./bpmnFlowOrder";
