import type { MessageOfType, ProtocolCommandType } from "./protocolMessageMap";

/**
 * Every command the element template editor's page may post to its host. A
 * value, not only a type, so a host can check at runtime that it routes each one.
 */
export const TEMPLATE_EDITOR_COMMAND_TYPES = [
    "GetElementTemplateFileCommand",
    "SyncDocumentCommand",
    "DocumentFlushedCommand",
    "LogDebugCommand",
    "LogInfoCommand",
    "LogWarningCommand",
    "LogErrorCommand",
] as const satisfies readonly ProtocolCommandType[];

export type TemplateEditorCommandType = (typeof TEMPLATE_EDITOR_COMMAND_TYPES)[number];

export type TemplateEditorCommand = MessageOfType<TemplateEditorCommandType>;
