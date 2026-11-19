import type {
    FormEditorCommand,
    FormEditorCommandType,
    MessageOfType,
    Query,
} from "@miragon/bpmn-modeler-shared";

import { emptyCamunda8Form, emptyInputValues } from "./documentPreview";

/** The way back to the webview. */
export interface PreviewSession {
    reply(query: Query): void;
}

/** What the preview does with a command, or why it drops it. */
export type PreviewRoute<TType extends FormEditorCommandType> =
    | ((command: MessageOfType<TType>, preview: PreviewSession) => void)
    | { readonly ignored: string };

/** A row per Form editor command: a command without one fails to compile. */
type PreviewCommandTable = {
    readonly [TType in FormEditorCommandType]: PreviewRoute<TType>;
};

const PREVIEW_COMMANDS: PreviewCommandTable = {
    SyncDocumentCommand: { ignored: "the preview has no file to write an edit to" },
    DocumentFlushedCommand: { ignored: "the preview has no file to save" },
    LogWarningCommand: ({ message }) => console.warn(message),
    LogErrorCommand: ({ message }) => console.error(message),
    GetFormFileCommand: (_, preview) => preview.reply(emptyCamunda8Form()),
    GetFormInputValuesCommand: (_, preview) => preview.reply(emptyInputValues()),
    UpdateFormOutputValuesCommand: { ignored: "the preview has no host to hand the output to" },
};

/** The row of a command type; a type without one, an inherited object member's included, throws. */
export function previewRouteOf(type: string): PreviewRoute<FormEditorCommandType> {
    if (!Object.hasOwn(PREVIEW_COMMANDS, type)) {
        throw new Error(`Unknown message type: ${type}`);
    }
    return PREVIEW_COMMANDS[type as FormEditorCommandType] as PreviewRoute<FormEditorCommandType>;
}

export function routePreviewCommand(command: FormEditorCommand, preview: PreviewSession): void {
    const route = previewRouteOf(command.type);
    if ("ignored" in route) {
        console.debug(`[DEBUG] ${command.type} ignored: ${route.ignored}`, command);
        return;
    }
    // Sound because the table hands each row only commands of its own key's type.
    (route as (command: FormEditorCommand, preview: PreviewSession) => void)(command, preview);
}
