import {
    logPreviewError,
    type PreviewCommandTable,
    type Query,
    type TemplateEditorCommandType,
} from "@miragon/bpmn-modeler-shared";

import { previewTemplateFile } from "./templateFilePreview";

/** The URL a command arrives with, and the way back to the editor. */
export interface PreviewSession {
    /** The URL's query when the command arrived. */
    readonly search: string;
    reply(query: Query): void;
}

export const PREVIEW_COMMANDS: PreviewCommandTable<TemplateEditorCommandType, PreviewSession> = {
    GetElementTemplateFileCommand: (_, preview) =>
        previewTemplateFile(preview.search).forEach((query) => preview.reply(query)),
    SyncDocumentCommand: { ignored: "the preview has no file to write an edit to" },
    DocumentFlushedCommand: { ignored: "the preview has no file to save" },
    LogDebugCommand: ({ message }) => console.debug(message),
    LogInfoCommand: ({ message }) => console.info(message),
    LogWarningCommand: ({ message }) => console.warn(message),
    LogErrorCommand: logPreviewError,
};

export const PREVIEW_LOG_PREFIX = "[DEBUG]";
