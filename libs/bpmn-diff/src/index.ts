/**
 * `@miragon/bpmn-modeler-diff` — the host-agnostic, Node- and browser-safe data
 * layer for BPMN diffing.
 *
 * `computeDiff(beforeXml, afterXml)` parses and compares two BPMN documents and
 * returns a serializable {@link DiffResult}; `sideView` projects that result
 * onto one pane's canvas; `elementXml` cuts one element's XML for a text diff;
 * `elementSnapshots` parses a document once and returns every unit's XML,
 * parent, container, lanes, references, parts, layout and plane, under the
 * diff's unit rule or the caller's (the merge's); `createDocumentModdle`
 * gives versions one shared prefix per namespace and, optionally, an engine
 * descriptor;
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
export type { FlowPosition } from "./bpmnFlowOrder";
export { elementSnapshots } from "./elementSnapshots";
export type {
    ElementSnapshot,
    ElementSnapshotOptions,
    SnapshotReference,
} from "./elementSnapshots";
export { idOf, idsOf, isModdleElement, isType, moddleElements } from "./moddleElement";
export type { ModdleElement } from "./moddleElement";
export { trackedElementOf } from "./trackedElements";
export { containmentProperties, walkContainment } from "./moddleContainment";
export { createDocumentModdle } from "./documentModdle";
export type { PrefixedModdle } from "./upstreamInternals/moddleNamespaces";
export { loadExecutionPackage } from "./executionPackages";
export type { ExecutionEngine, ExecutionPackage } from "./executionPackages";
export { namespaceDeclarations } from "./namespaceDeclarations";
export type { ModdleParseResult } from "./bpmnModdleFactory";
