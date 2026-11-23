/**
 * `@miragon/bpmn-modeler-diff` — the host-agnostic, Node- and browser-safe data
 * layer for BPMN diffing.
 *
 * `computeDiff(beforeXml, afterXml)` parses and compares two BPMN documents and
 * returns a serializable {@link DiffResult}; `sideView` projects that result
 * onto one pane's canvas; `elementXml` cuts one element's XML for a text diff;
 * `elementSnapshots` parses a document once and returns every unit's XML,
 * attributes, parent, container, lanes, references, parts, layout and plane, under the
 * diff's unit rule or the caller's (the merge's); `createDocumentModdle`
 * gives versions one shared prefix per namespace and, optionally, an engine
 * descriptor;
 * `loadBpmnModdle` is the one lazy loader of the bpmn-moddle parser for every
 * workspace that parses BPMN without bpmn-js, and `moddleDescriptor` unwraps the
 * descriptors it is given. The package touches no DOM, no CSS, and no bpmn-js —
 * it is inlined into the publishable `@miragon/bpmn-modeler` under its `./diff`
 * subpath and imported directly by the extension engine (`modeler-core`).
 * This entry re-exports `service/` modules; a `domain/` file imports
 * `@miragon/bpmn-modeler-diff/domain` instead.
 */
export { computeDiff } from "./compare/service/computeDiff";
export { sideView } from "./present/domain/sideView";
export { elementXml } from "./snapshot/service/elementXml";
export { loadBpmnModdle } from "./moddle/service/loadBpmnModdle";
export { moddleDescriptor } from "./moddle/domain/bpmnModdleFactory";
export type { BpmnModdleFactory } from "./moddle/domain/bpmnModdleFactory";
export { layoutOnlyEdgeIds } from "./present/domain/drawnEdges";
export type {
    DiffSide,
    DiffCounts,
    DiffCategory,
    DiffResult,
    DiffSideView,
} from "./present/domain/diffResult";
export {
    buildFlowOrder,
    buildRemovedAnchors,
    sortIdsByOrder,
} from "./present/domain/bpmnFlowOrder";
export type { FlowPosition } from "./present/domain/bpmnFlowOrder";
export { elementSnapshots } from "./snapshot/service/elementSnapshots";
export { elementTexts, standaloneElementText } from "./snapshot/service/elementTexts";
export { rebindReferences } from "./snapshot/domain/rebindReferences";
export type {
    ElementTextOptions,
    OwnPropertyFilter,
    UnitText,
} from "./snapshot/service/elementTexts";
export { rootElementNamesOf } from "./parse/service/rootElements";
export type { RootElementName } from "./parse/service/rootElements";
export { unitParts, unitReferences } from "./snapshot/domain/unitStructure";
export { isDerivedReference } from "./snapshot/domain/elementSnippets";
export type { ElementSnapshot } from "./snapshot/domain/elementSnapshot";
export type { ElementSnapshotOptions } from "./snapshot/service/elementSnapshots";
export type { SnapshotReference } from "./snapshot/domain/unitStructure";
export {
    idOf,
    idsOf,
    isModdleElement,
    isType,
    moddleElements,
} from "./moddle/domain/moddleElement";
export type { ModdleElement, ModdlePropertyDescriptor } from "./moddle/domain/moddleElement";
export { trackedElementOf } from "./compare/domain/trackedElements";
export {
    containmentProperties,
    ownAttributeEntries,
    walkContainment,
} from "./parse/domain/moddleContainment";
export type { OwnAttributeEntry } from "./parse/domain/moddleContainment";
export { createDocumentModdle } from "./parse/service/documentModdle";
export type { PrefixedModdle } from "./parse/domain/upstreamInternals/moddleNamespaces";
export { loadExecutionPackage } from "./parse/service/loadExecutionPackage";
export type { ExecutionEngine, ExecutionPackage } from "./parse/domain/executionPackage";
export { isNamespaceDeclaration } from "./parse/domain/namespacePrefixes";
export { namespaceDeclarations } from "./parse/service/namespaceDeclarations";
export {
    isUnresolvedReferenceWarning,
    parseWarningMessages,
} from "./moddle/domain/bpmnModdleFactory";
export type {
    ModdleParseResult,
    ModdleParseWarning,
    ModdleReference,
} from "./moddle/domain/bpmnModdleFactory";
