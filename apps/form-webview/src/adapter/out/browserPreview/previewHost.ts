import {
    type FormEditorCommand,
    MockHostApi,
    replyFromPreview,
    routePreviewCommand,
} from "@miragon/bpmn-modeler-shared";

import type { WebviewState } from "../../../port/formHost";
import { PREVIEW_COMMANDS, PREVIEW_LOG_PREFIX } from "./previewCommands";

/**
 * The browser preview's host: answers the Form editor's commands with
 * synthetic `MessageEvent`s, as the command table in `previewCommands.ts`
 * routes them.
 */
export class PreviewHost extends MockHostApi<WebviewState, FormEditorCommand> {
    override postMessage(message: FormEditorCommand): void {
        routePreviewCommand(
            PREVIEW_COMMANDS,
            message,
            { reply: replyFromPreview },
            PREVIEW_LOG_PREFIX,
        );
    }
}
