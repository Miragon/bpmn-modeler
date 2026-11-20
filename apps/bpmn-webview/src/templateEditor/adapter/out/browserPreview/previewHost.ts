import {
    MockHostApi,
    replyFromPreview,
    routePreviewCommand,
    type TemplateEditorCommand,
} from "@miragon/bpmn-modeler-shared";

import { PREVIEW_COMMANDS, PREVIEW_LOG_PREFIX } from "./previewCommands";

/**
 * The browser preview's host: answers the template editor's commands with
 * synthetic `MessageEvent`s, as the command table in `previewCommands.ts`
 * routes them.
 */
export class PreviewHost extends MockHostApi<unknown, TemplateEditorCommand> {
    override postMessage(message: TemplateEditorCommand): void {
        routePreviewCommand(
            PREVIEW_COMMANDS,
            message,
            { search: window.location.search, reply: replyFromPreview },
            PREVIEW_LOG_PREFIX,
        );
    }
}
