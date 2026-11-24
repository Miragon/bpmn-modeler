/**
 * Editable, engine-neutral BPMN modeling with a properties panel.
 * Use `detectEngine(xml)` to route untagged models here (`undefined` means Design).
 * Load `@miragon/bpmn-modeler/design.css` separately.
 */

export { createDesigner } from "./composition/createDesigner";
export type {
    DesignerOptions,
    DesignerCapabilities,
    BpmnDesignerHandle,
    CoreDesignerServices,
    CreateDesigner,
} from "./design/port/publicApi";
export type {
    ThemeMode,
    ClipboardOptions,
    ContentSavedEvent,
    ElementIdConvention,
    ElementIdOptions,
} from "./modeler/port/publicApi";
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

export type { ModelNavigationPort, ModelReference } from "@miragon/bpmn-model-navigation";
export type { ReferenceKind } from "@miragon/bpmn-modeler-types";

export type { DefinitionSearchPort } from "@miragon/bpmn-modeler-definition-search";
export type {
    DefinitionKind,
    DefinitionSearchQuery,
    DefinitionSource,
    DefinitionUsage,
    ModelDefinition,
    WorkspaceDefinition,
} from "@miragon/bpmn-modeler-types";
export { extractModelDefinitions } from "./kernel/domain/extractModelDefinitions";

export { detectEngine } from "./kernel/domain/detectEngine";
export type { DetectedEngine } from "./kernel/domain/detectEngine";

export type { BpmnSurfaceHandle, PendingInputHandle } from "./kernel/service/surfaceHandle";
export type { ViewportManager } from "./kernel/service/viewport";
export type { ViewportData } from "./kernel/service/viewport";
export type { SelectionManager } from "./kernel/service/selection";
export type { RootElementManager } from "./kernel/service/rootElement";
export type { ViewState } from "./kernel/service/viewState";

export { NoModelerError } from "@miragon/bpmn-modeler-types";
export type { ClipboardBridge } from "@miragon/bpmn-modeler-clipboard";
