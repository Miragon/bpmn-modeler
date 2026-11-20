import {
    type FormEditorCommandType,
    logPreviewError,
    type PreviewCommandTable,
    type Query,
} from "@miragon/bpmn-modeler-shared";

import { emptyCamunda8Form, emptyInputValues } from "./documentPreview";

/** The way back to the webview. */
export interface PreviewSession {
    reply(query: Query): void;
}

export const PREVIEW_COMMANDS: PreviewCommandTable<FormEditorCommandType, PreviewSession> = {
    SyncDocumentCommand: { ignored: "the preview has no file to write an edit to" },
    DocumentFlushedCommand: { ignored: "the preview has no file to save" },
    LogWarningCommand: ({ message }) => console.warn(message),
    LogErrorCommand: logPreviewError,
    GetFormFileCommand: (_, preview) => preview.reply(emptyCamunda8Form()),
    GetFormInputValuesCommand: (_, preview) => preview.reply(emptyInputValues()),
    UpdateFormOutputValuesCommand: { ignored: "the preview has no host to hand the output to" },
};

export const PREVIEW_LOG_PREFIX = "[DEBUG]";
