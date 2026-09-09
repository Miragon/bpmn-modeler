/**
 * Readonly BPMN viewing and browser diff rendering, without the Camunda editing stack.
 * Load `@miragon/bpmn-modeler/viewer.css` separately.
 */

export { createViewer } from "./createViewer";
export type {
    ViewerOptions,
    ViewerCapabilities,
    BpmnViewerHandle,
    CoreViewerServices,
    CreateViewer,
} from "./publicApi";
export type { ThemeMode } from "../publicApi";

export type {
    ModelNavigationPort,
    ModelReference,
    ReferenceKind,
} from "@miragon/bpmn-model-navigation";

export { ViewportManager } from "../viewport";
export type { ViewportData } from "../viewport";
export { SelectionManager } from "../selection";
export type { RootElementManager } from "../rootElement";
export type { ViewState } from "../viewState";

// Diff computation is also usable in Node through @miragon/bpmn-modeler/diff.
export { DiffViewer } from "./diff/DiffViewer";
export type { DiffMarkerClass } from "./diff/DiffViewer";
export { DiffLegend } from "./diff/DiffLegend";
export type { DiffLegendCallbacks, DiffLegendContext } from "./diff/DiffLegend";
export { DiffNavigator } from "./diff/DiffNavigator";
export { DiffPaneCoordinator } from "./diff/DiffPaneCoordinator";

export { NoModelerError } from "@miragon/bpmn-modeler-types";
