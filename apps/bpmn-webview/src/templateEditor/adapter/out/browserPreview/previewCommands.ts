import type {
    MessageOfType,
    Query,
    TemplateEditorCommand,
    TemplateEditorCommandType,
} from "@miragon/bpmn-modeler-shared";

import { previewTemplateFile } from "./templateFilePreview";

/** The URL a command arrives with, and the way back to the editor. */
export interface PreviewSession {
    /** The URL's query when the command arrived. */
    readonly search: string;
    reply(query: Query): void;
}

/** What the preview does with a command, or why it drops it. */
export type PreviewRoute<TType extends TemplateEditorCommandType> =
    | ((command: MessageOfType<TType>, preview: PreviewSession) => void)
    | { readonly ignored: string };

/** A row per template editor command: a command without one fails to compile. */
type PreviewCommandTable = {
    readonly [TType in TemplateEditorCommandType]: PreviewRoute<TType>;
};

const PREVIEW_COMMANDS: PreviewCommandTable = {
    GetElementTemplateFileCommand: (_, preview) =>
        previewTemplateFile(preview.search).forEach((query) => preview.reply(query)),
    SyncDocumentCommand: { ignored: "the preview has no file to write an edit to" },
    DocumentFlushedCommand: { ignored: "the preview has no file to save" },
    LogDebugCommand: ({ message }) => console.debug(message),
    LogInfoCommand: ({ message }) => console.info(message),
    LogWarningCommand: ({ message }) => console.warn(message),
    LogErrorCommand: ({ message }) => console.error(message),
};

/** The row of a command type; a type without one, an inherited object member's included, throws. */
export function previewRouteOf(type: string): PreviewRoute<TemplateEditorCommandType> {
    if (!Object.hasOwn(PREVIEW_COMMANDS, type)) {
        throw new Error(`Unknown message type: ${type}`);
    }
    return PREVIEW_COMMANDS[
        type as TemplateEditorCommandType
    ] as PreviewRoute<TemplateEditorCommandType>;
}

export function routePreviewCommand(command: TemplateEditorCommand, preview: PreviewSession): void {
    const route = previewRouteOf(command.type);
    if ("ignored" in route) {
        console.debug(`[DEBUG] ${command.type} ignored: ${route.ignored}`, command);
        return;
    }
    // Sound because the table hands each row only commands of its own key's type.
    (route as (command: TemplateEditorCommand, preview: PreviewSession) => void)(command, preview);
}
