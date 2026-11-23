import {
    logPreviewDebug,
    logPreviewError,
    logPreviewInfo,
    logPreviewWarning,
    PREVIEW_NO_FILE_TO_SAVE,
    PREVIEW_NO_FILE_TO_WRITE_EDIT_TO,
    type PreviewCommandTable,
    type Query,
    type TemplateEditorCommand,
} from "@miragon/bpmn-modeler-shared";

import { previewTemplateFile } from "./templateFilePreview";

/** The URL a command arrives with, and the way back to the editor. */
export interface PreviewSession {
    /** The URL's query when the command arrived. */
    readonly search: string;
    reply(query: Query): void;
}

export const PREVIEW_COMMANDS: PreviewCommandTable<TemplateEditorCommand, PreviewSession> = {
    GetElementTemplateFileCommand: (_, preview) =>
        previewTemplateFile(preview.search).forEach((query) => preview.reply(query)),
    SyncDocumentCommand: { ignored: PREVIEW_NO_FILE_TO_WRITE_EDIT_TO },
    DocumentFlushedCommand: { ignored: PREVIEW_NO_FILE_TO_SAVE },
    LogDebugCommand: logPreviewDebug,
    LogInfoCommand: logPreviewInfo,
    LogWarningCommand: logPreviewWarning,
    LogErrorCommand: logPreviewError,
};
