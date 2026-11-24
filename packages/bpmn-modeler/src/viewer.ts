/**
 * Readonly BPMN viewing and browser diff rendering, without the Camunda editing stack.
 * Load `@miragon/bpmn-modeler/viewer.css` separately.
 */

export { createViewer } from "./composition/createViewer";
export type {
    ViewerOptions,
    ViewerCapabilities,
    BpmnViewerHandle,
    CoreViewerServices,
    CreateViewer,
} from "./viewer/port/publicApi";
export type { ThemeMode } from "./modeler/port/publicApi";

export type { ModelNavigationPort, ModelReference } from "@miragon/bpmn-model-navigation";
export type { ReferenceKind } from "@miragon/bpmn-modeler-types";

export type { BpmnSurfaceHandle } from "./kernel/service/surfaceHandle";
export type { ViewportManager } from "./kernel/service/viewport";
export type { ViewportData } from "./kernel/service/viewport";
export type { SelectionManager } from "./kernel/service/selection";
export type { RootElementManager } from "./kernel/service/rootElement";
export type { ViewState } from "./kernel/service/viewState";

// Diff computation is also usable in Node through @miragon/bpmn-modeler/diff.
export { DiffViewer } from "./diff/service/DiffViewer";
export type { DiffMarkerClass, DiffViewerOptions } from "./diff/service/DiffViewer";
export { DiffLegend } from "./diff/adapter/in/DiffLegend";
export type { DiffLegendCallbacks, DiffLegendContext } from "./diff/adapter/in/DiffLegend";
export { DiffNavigator } from "./diff/service/DiffNavigator";
export { DiffSideLabel } from "./diff/adapter/in/DiffSideLabel";
export { bpmnElementIdOf } from "./diff/domain/diffSelection";
export type { BpmnDiagramElement } from "./diff/domain/diffSelection";
export { DiffPaneCoordinator } from "./diff/service/DiffPaneCoordinator";

export { NoModelerError } from "@miragon/bpmn-modeler-types";
