import {
    type FormEditorCommand,
    logPreviewError,
    logPreviewWarning,
    PREVIEW_NO_FILE_TO_SAVE,
    PREVIEW_NO_FILE_TO_WRITE_EDIT_TO,
    type PreviewCommandTable,
    type Query,
} from "@miragon/bpmn-modeler-shared";

import { emptyCamunda8Form, emptyInputValues } from "./documentPreview";

/** The way back to the webview. */
export interface PreviewSession {
    reply(query: Query): void;
}

export const PREVIEW_COMMANDS: PreviewCommandTable<FormEditorCommand, PreviewSession> = {
    SyncDocumentCommand: { ignored: PREVIEW_NO_FILE_TO_WRITE_EDIT_TO },
    DocumentFlushedCommand: { ignored: PREVIEW_NO_FILE_TO_SAVE },
    LogWarningCommand: logPreviewWarning,
    LogErrorCommand: logPreviewError,
    GetFormFileCommand: (_, preview) => preview.reply(emptyCamunda8Form()),
    GetFormInputValuesCommand: (_, preview) => preview.reply(emptyInputValues()),
    UpdateFormOutputValuesCommand: { ignored: "the preview has no host to hand the output to" },
};
