import {
    type DmnEditorCommand,
    logPreviewError,
    logPreviewWarning,
    PREVIEW_NO_FILE_TO_SAVE,
    PREVIEW_NO_FILE_TO_WRITE_EDIT_TO,
    PREVIEW_OPENS_PANEL_THE_SAME_WAY,
    type PreviewCommandTable,
    type Query,
} from "@miragon/bpmn-modeler-shared";

import { previewDocument, previewFocus, previewModelerSettings, previewPanelState } from "./editorPreview";

/** The way back to the webview a command arrives from. */
export interface PreviewSession {
    reply(query: Query): void;
}

export const PREVIEW_COMMANDS: PreviewCommandTable<DmnEditorCommand, PreviewSession> = {
    GetDmnFileCommand: (_, preview) => preview.reply(previewDocument()),
    GetPropertiesPanelStateCommand: (_, preview) => preview.reply(previewPanelState()),
    GetDmnModelerSettingCommand: (_, preview) => preview.reply(previewModelerSettings()),
    SetPropertiesPanelStateCommand: { ignored: PREVIEW_OPENS_PANEL_THE_SAME_WAY },
    RequestFocusCommand: (_, preview) => preview.reply(previewFocus()),
    SyncDocumentCommand: { ignored: PREVIEW_NO_FILE_TO_WRITE_EDIT_TO },
    DocumentFlushedCommand: { ignored: PREVIEW_NO_FILE_TO_SAVE },
    LogWarningCommand: logPreviewWarning,
    LogErrorCommand: logPreviewError,
};
