/**
 * Editable, engine-neutral BPMN modeling with a properties panel.
 * Use `detectEngine(xml)` to route untagged models here (`undefined` means Design).
 * Load `@miragon/bpmn-modeler/design.css` separately.
 */

export { createDesigner } from "./createDesigner";
export type {
    DesignerOptions,
    DesignerCapabilities,
    BpmnDesignerHandle,
    CoreDesignerServices,
    CreateDesigner,
} from "./publicApi";
export type { ThemeMode, ClipboardOptions, ContentSavedEvent } from "../publicApi";

export type {
    ModelNavigationPort,
    ModelReference,
    ReferenceKind,
} from "@miragon/bpmn-model-navigation";

export type { DefinitionSearchPort } from "@miragon/bpmn-modeler-definition-search";
export type {
    DefinitionKind,
    DefinitionSearchQuery,
    DefinitionSource,
    DefinitionUsage,
    ModelDefinition,
    WorkspaceDefinition,
} from "@miragon/bpmn-modeler-types";
export { extractModelDefinitions } from "../extractModelDefinitions";

export { detectEngine } from "../detectEngine";
export type { DetectedEngine } from "../detectEngine";

export type { BpmnSurfaceHandle } from "../surfaceHandle";
export type { ViewportManager } from "../viewport";
export type { ViewportData } from "../viewport";
export type { SelectionManager } from "../selection";
export type { RootElementManager } from "../rootElement";
export type { ViewState } from "../viewState";

export { NoModelerError } from "@miragon/bpmn-modeler-types";
export type { ClipboardBridge } from "@miragon/bpmn-modeler-clipboard";
