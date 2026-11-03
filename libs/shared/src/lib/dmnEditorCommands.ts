import type { MessageOfType, ProtocolCommandType } from "./protocolMessageMap";

/**
 * Every command the DMN editor webview may post to its host. A value, not only
 * a type, so a host can check at runtime that it routes each one.
 */
export const DMN_EDITOR_COMMAND_TYPES = [
    "SyncDocumentCommand",
    "DocumentFlushedCommand",
    "LogWarningCommand",
    "LogErrorCommand",
    "RequestFocusCommand",
    "GetDmnFileCommand",
    "GetDmnModelerSettingCommand",
    "GetPropertiesPanelStateCommand",
    "SetPropertiesPanelStateCommand",
] as const satisfies readonly ProtocolCommandType[];

export type DmnEditorCommandType = (typeof DMN_EDITOR_COMMAND_TYPES)[number];

export type DmnEditorCommand = MessageOfType<DmnEditorCommandType>;
