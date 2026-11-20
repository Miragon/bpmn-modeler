import type { DmnEditorCommandType, PreviewCommandTable, Query } from "@miragon/bpmn-modeler-shared";

import { previewDocument, previewFocus, previewModelerSettings, previewPanelState } from "./editorPreview";

/** The way back to the webview a command arrives from. */
export interface PreviewSession {
    reply(query: Query): void;
}

export const PREVIEW_COMMANDS: PreviewCommandTable<DmnEditorCommandType, PreviewSession> = {
    GetDmnFileCommand: (_, preview) => preview.reply(previewDocument()),
    GetPropertiesPanelStateCommand: (_, preview) => preview.reply(previewPanelState()),
    GetDmnModelerSettingCommand: (_, preview) => preview.reply(previewModelerSettings()),
    SetPropertiesPanelStateCommand: { ignored: "the preview always opens the panel the same way" },
    RequestFocusCommand: (_, preview) => preview.reply(previewFocus()),
    SyncDocumentCommand: { ignored: "the preview has no file to write an edit to" },
    DocumentFlushedCommand: { ignored: "the preview has no file to save" },
    LogWarningCommand: ({ message }) => console.warn(message),
    LogErrorCommand: ({ message }) => console.error(message),
};
