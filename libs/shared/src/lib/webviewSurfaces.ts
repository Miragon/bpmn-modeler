import { ADD_ONS_VIEW_COMMAND_TYPES } from "./addOnsViewCommands";
import { BPMN_EDITOR_COMMAND_TYPES } from "./bpmnEditorCommands";
import { DEPLOYMENT_SIDEBAR_COMMAND_TYPES } from "./deploymentSidebarCommands";
import { DIFF_PANE_COMMAND_TYPES, DIFF_PANE_HANDSHAKE_COMMAND_TYPES } from "./diffPaneCommands";
import { DMN_EDITOR_COMMAND_TYPES } from "./dmnEditorCommands";
import { FORM_EDITOR_COMMAND_TYPES } from "./formEditorCommands";
import { TEMPLATE_EDITOR_COMMAND_TYPES } from "./templateEditorCommands";

/**
 * The commands each webview surface may post to its host. Every command a
 * webview constructs is in at least one list, and every host keeps a coverage
 * table per surface, so a new surface or command cannot reach a host that
 * drops it.
 */
export const WEBVIEW_SURFACE_COMMAND_TYPES = {
    bpmnEditor: BPMN_EDITOR_COMMAND_TYPES,
    bpmnDiffPane: [...DIFF_PANE_HANDSHAKE_COMMAND_TYPES, ...DIFF_PANE_COMMAND_TYPES],
    dmnEditor: DMN_EDITOR_COMMAND_TYPES,
    formEditor: FORM_EDITOR_COMMAND_TYPES,
    templateEditor: TEMPLATE_EDITOR_COMMAND_TYPES,
    deploymentSidebar: DEPLOYMENT_SIDEBAR_COMMAND_TYPES,
    addOnsView: ADD_ONS_VIEW_COMMAND_TYPES,
} as const;

export type WebviewSurface = keyof typeof WEBVIEW_SURFACE_COMMAND_TYPES;

export type WebviewSurfaceCommandType<TSurface extends WebviewSurface> =
    (typeof WEBVIEW_SURFACE_COMMAND_TYPES)[TSurface][number];
