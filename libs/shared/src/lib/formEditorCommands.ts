import type { MessageOfType, ProtocolCommandType } from "./protocolMessageMap";

/**
 * Every command the Form editor webview may post to its host. A value, not
 * only a type, so a host can check at runtime that it routes each one.
 */
export const FORM_EDITOR_COMMAND_TYPES = [
    "SyncDocumentCommand",
    "DocumentFlushedCommand",
    "LogWarningCommand",
    "LogErrorCommand",
    "GetFormFileCommand",
    "GetFormInputValuesCommand",
    "UpdateFormOutputValuesCommand",
] as const satisfies readonly ProtocolCommandType[];

export type FormEditorCommandType = (typeof FORM_EDITOR_COMMAND_TYPES)[number];

export type FormEditorCommand = MessageOfType<FormEditorCommandType>;
