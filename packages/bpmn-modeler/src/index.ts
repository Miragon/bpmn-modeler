/**
 * `@miragon/bpmn-modeler` — the host-free, publishable BPMN modeler.
 *
 * The factory and the handle are the supported surface; the `@internal`-tagged
 * exports below exist only for the in-repo `apps/bpmn-webview` adapter.
 */

// Load theme overrides last so they take precedence over the base styles.
import "./styles/default.css";
import "./styles/diff.css";
import "../../../libs/modeler-browser/src/canvasOverlays.css";
import "./styles/themes.css";

export { createModeler } from "./composition/createModeler";
export { createTemplatePreview } from "./templatePreview/service/createTemplatePreview";
export type {
    TemplatePreviewHandle,
    TemplatePreviewOptions,
    TemplatePreviewOutcome,
} from "./templatePreview/service/createTemplatePreview";
export type {
    ThemeMode,
    ModelerMode,
    LintingOptions,
    LintConfigByMode,
    LintConfigOption,
    LintModule,
    ClipboardOptions,
    ContentSavedEvent,
    ElementIdConvention,
    ElementIdOptions,
    ModelerOptions,
    BpmnModelerHandle,
    CoreModelerServices,
    CreateModeler,
    StableModelerSurface,
} from "./modeler/port/publicApi";
export type { BpmnSurfaceHandle, PendingInputHandle } from "./kernel/port/surfaceHandle";
export { isEditableSurface, isModelerSurface } from "./modeSession/service/surfaceCapabilities";
export type { EditableSurfaceHandle } from "./modeSession/service/surfaceCapabilities";
export type { ModelerCapabilities } from "./modeler/port/capabilities";
export type { DefinitionSearchPort } from "@miragon/bpmn-modeler-definition-search";
export type {
    ModelNavigationPort,
    ModelReference,
    PreviewRect,
    FormPreviewAnchor,
    FormPreviewRequest,
    FormPreviewHandle,
    FormPreviewPort,
} from "@miragon/bpmn-model-navigation";
export type { ReferenceKind } from "@miragon/bpmn-modeler-types";

export type {
    Engine,
    ElementTemplateRef,
    BpmnModelerSetting,
    BpmnlintConfig,
    LintResults,
    LintRunEvent,
    DefinitionKind,
    DefinitionSearchQuery,
    DefinitionSource,
    DefinitionUsage,
    ModelDefinition,
    WorkspaceDefinition,
} from "@miragon/bpmn-modeler-types";
export { NoModelerError, UnsupportedEngineError } from "@miragon/bpmn-modeler-types";
export { extractModelDefinitions } from "./kernel/domain/extractModelDefinitions";
export { detectEngine } from "./kernel/domain/detectEngine";
export type { DetectedEngine } from "./kernel/domain/detectEngine";
export type { ClipboardBridge } from "@miragon/bpmn-modeler-clipboard";
export type { LayoutOutcome } from "@miragon/bpmn-modeler-layout";
export type {
    CleanupItem,
    CleanupOutcome,
    CleanupStatus,
    CleanupKind,
    LayoutDiagnostic,
    LayoutErrorCode,
    LayoutStatus,
} from "@miragon/bpmn-modeler-types";
export type {
    ElementIdConventionOptions,
    ElementIdKind,
    EventDefinitionQualifierMode,
    ElementIdProposals,
    ElementIdRow,
    ElementIdRowStatus,
    ElementIdSettings,
} from "@miragon/bpmn-modeler-types";

export type { ViewportManager } from "./kernel/port/canvasManagers";
export type { ViewportData } from "./kernel/domain/viewState";
export type { SelectionManager } from "./kernel/port/canvasManagers";
export type { RootElementManager } from "./kernel/port/canvasManagers";
export type { ViewState } from "./kernel/domain/viewState";

// Local aliases preserve @deprecated in the declaration rollup; API Extractor drops it on bare re-exports.
import { DiffViewer as DiffViewerImpl } from "./diff/service/DiffViewer";
import type { DiffMarkerClass as DiffMarkerClassImpl } from "./diff/service/DiffViewer";
import { DiffLegend as DiffLegendImpl } from "./diff/adapter/in/DiffLegend";
import type {
    DiffLegendCallbacks as DiffLegendCallbacksImpl,
    DiffLegendContext as DiffLegendContextImpl,
} from "./diff/adapter/in/DiffLegend";
import { DiffNavigator as DiffNavigatorImpl } from "./diff/service/DiffNavigator";
import { DiffPaneCoordinator as DiffPaneCoordinatorImpl } from "./diff/service/DiffPaneCoordinator";

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
export { BpmnModeler } from "./modeler/service/modeler";
/** @internal */
export type { CreateModelerOptions } from "./modeler/port/publicApi";
