/**
 * `@miragon/bpmn-modeler` — the host-free, publishable BPMN modeler.
 *
 * The factory and the handle are the supported surface; the `@internal`-tagged
 * exports below exist only for the in-repo `apps/bpmn-webview` adapter.
 */

// Load theme overrides last so they take precedence over the base styles.
import "./styles/default.css";
import "./styles/diff.css";
import "./styles/canvasFocusIndicator.css";
import "./styles/themes.css";

export { createModeler } from "./createModeler";
export type {
    ThemeMode,
    ModelerMode,
    LintingOptions,
    LintConfigByMode,
    LintConfigOption,
    LintModule,
    ClipboardOptions,
    ContentSavedEvent,
    ModelerOptions,
    BpmnModelerHandle,
    CoreModelerServices,
    CreateModeler,
    StableModelerSurface,
} from "./publicApi";
export type { ModelerCapabilities } from "./capabilities";
export type {
    ModelNavigationPort,
    ModelReference,
    ReferenceKind,
} from "@miragon/bpmn-model-navigation";
export { UnsupportedEngineError } from "./modeler";

export type {
    Engine,
    BpmnModelerSetting,
    BpmnlintConfig,
    LintResults,
    LintRunEvent,
} from "@miragon/bpmn-modeler-types";
export { NoModelerError } from "@miragon/bpmn-modeler-types";
export { detectEngine } from "./detectEngine";
export type { DetectedEngine } from "./detectEngine";
export type { ClipboardBridge } from "@miragon/bpmn-modeler-clipboard";

export { ViewportManager } from "./viewport";
export type { ViewportData } from "./viewport";
export { SelectionManager } from "./selection";
export type { RootElementManager } from "./rootElement";
export type { ViewState } from "./viewState";

// Local aliases preserve @deprecated in the declaration rollup; API Extractor drops it on bare re-exports.
import { DiffViewer as DiffViewerImpl } from "./viewer/diff/DiffViewer";
import type { DiffMarkerClass as DiffMarkerClassImpl } from "./viewer/diff/DiffViewer";
import { DiffLegend as DiffLegendImpl } from "./viewer/diff/DiffLegend";
import type {
    DiffLegendCallbacks as DiffLegendCallbacksImpl,
    DiffLegendContext as DiffLegendContextImpl,
} from "./viewer/diff/DiffLegend";
import { DiffNavigator as DiffNavigatorImpl } from "./viewer/diff/DiffNavigator";
import { DiffPaneCoordinator as DiffPaneCoordinatorImpl } from "./viewer/diff/DiffPaneCoordinator";

/** @deprecated Import from `@miragon/bpmn-modeler/viewer` instead; removed in a future major. */
export const DiffViewer = DiffViewerImpl;
/** @deprecated Import from `@miragon/bpmn-modeler/viewer` instead; removed in a future major. */
export type DiffViewer = DiffViewerImpl;
/** @deprecated Import from `@miragon/bpmn-modeler/viewer` instead; removed in a future major. */
export type DiffMarkerClass = DiffMarkerClassImpl;
/** @deprecated Import from `@miragon/bpmn-modeler/viewer` instead; removed in a future major. */
export const DiffLegend = DiffLegendImpl;
/** @deprecated Import from `@miragon/bpmn-modeler/viewer` instead; removed in a future major. */
export type DiffLegend = DiffLegendImpl;
/** @deprecated Import from `@miragon/bpmn-modeler/viewer` instead; removed in a future major. */
export type DiffLegendCallbacks = DiffLegendCallbacksImpl;
/** @deprecated Import from `@miragon/bpmn-modeler/viewer` instead; removed in a future major. */
export type DiffLegendContext = DiffLegendContextImpl;
/** @deprecated Import from `@miragon/bpmn-modeler/viewer` instead; removed in a future major. */
export const DiffNavigator = DiffNavigatorImpl;
/** @deprecated Import from `@miragon/bpmn-modeler/viewer` instead; removed in a future major. */
export type DiffNavigator = DiffNavigatorImpl;
/** @deprecated Import from `@miragon/bpmn-modeler/viewer` instead; removed in a future major. */
export const DiffPaneCoordinator = DiffPaneCoordinatorImpl;
/** @deprecated Import from `@miragon/bpmn-modeler/viewer` instead; removed in a future major. */
export type DiffPaneCoordinator = DiffPaneCoordinatorImpl;

/** @internal */
export { BpmnModeler } from "./modeler";
/** @internal */
export type { CreateModelerOptions } from "./createModeler";
