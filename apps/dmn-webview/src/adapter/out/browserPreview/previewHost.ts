import {
    type DmnEditorCommand,
    MockHostApi,
    replyFromPreview,
    routePreviewCommand,
} from "@miragon/bpmn-modeler-shared";

import type { WebviewState } from "../../../port/dmnHost";
import { PREVIEW_COMMANDS, PREVIEW_LOG_PREFIX } from "./previewCommands";

/** The browser preview's editor host: answers the webview's commands as `previewCommands.ts` routes them. */
export class PreviewHost extends MockHostApi<WebviewState, DmnEditorCommand> {
    override postMessage(message: DmnEditorCommand): void {
        routePreviewCommand(PREVIEW_COMMANDS, message, { reply: replyFromPreview }, PREVIEW_LOG_PREFIX);
    }
}
