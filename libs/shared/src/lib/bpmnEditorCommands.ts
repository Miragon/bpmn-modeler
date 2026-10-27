import type { MessageOfType, ProtocolCommandType } from "./protocolMessageMap";

/**
 * Every command the BPMN editor webview may post to its host; the diff pane,
 * the DMN and Form editors and the deployment sidebar post their own. A value,
 * not only a type, so a host can check at runtime that it routes each one.
 */
export const BPMN_EDITOR_COMMAND_TYPES = [
    "SyncDocumentCommand",
    "DocumentFlushedCommand",
    "LogDebugCommand",
    "LogInfoCommand",
    "LogWarningCommand",
    "LogErrorCommand",
    "ShowInfoCommand",
    "RequestFocusCommand",
    "GetBpmnFileCommand",
    "GetDiagramAsSVGCommand",
    "GetElementTemplatesCommand",
    "GetBpmnlintConfigCommand",
    "GetBpmnModelerSettingCommand",
    "GetPropertiesPanelStateCommand",
    "SetPropertiesPanelStateCommand",
    "SetLintingEnabledCommand",
    "UpdateLintResultsCommand",
    "GetClipboardCommand",
    "SetClipboardCommand",
    "GetTextClipboardCommand",
    "SetTextClipboardCommand",
    "NavigateToReferencedModelCommand",
    "NavigateToImplementationCommand",
    "SyncActivitiesCommand",
    "GetFormReferenceStatusCommand",
    "SearchWorkspaceDefinitionsCommand",
    "OpenScriptEditorCommand",
    "OpenScriptEditorsCommand",
    "UpdateScriptSourceCommand",
    "UpdateScriptVariablesCommand",
    "DiagramFormattedCommand",
    "CleanupReportCommand",
] as const satisfies readonly ProtocolCommandType[];

export type BpmnEditorCommandType = (typeof BPMN_EDITOR_COMMAND_TYPES)[number];

export type BpmnEditorCommand = MessageOfType<BpmnEditorCommandType>;
