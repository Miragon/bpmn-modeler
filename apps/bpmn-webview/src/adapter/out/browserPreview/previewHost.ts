import { MockHostApi, replyFromPreview, routePreviewCommand } from "@miragon/bpmn-modeler-shared";

import type { BpmnWebviewCommand } from "../../../port/hostChannel";
import type { WebviewState } from "../../../port/webviewState";
import { DiffPreview } from "./diffPreview";
import { PREVIEW_COMMANDS, PREVIEW_LOG_PREFIX } from "./previewCommands";
import { PREVIEW_MODES, readPreviewMode } from "./previewMode";

/**
 * The browser preview's host: answers the webview's commands with synthetic
 * `MessageEvent`s, in the {@link PreviewMode} the URL's `?mode=` selects, as
 * the command table in `previewCommands.ts` routes them. Each answer lives in
 * its feature's module beside this one.
 */
export class PreviewHost extends MockHostApi<WebviewState, BpmnWebviewCommand> {
    private readonly mode = readPreviewMode(window.location.search);

    private readonly diffPreview = new DiffPreview();

    constructor() {
        super();
        console.info(
            "[dev] bpmn-webview mock ready.  Mode:",
            this.mode,
            `\nURL variants: ${PREVIEW_MODES.map((mode) => `/?mode=${mode}`).join(", ")}`,
        );
    }

    override postMessage(message: BpmnWebviewCommand): void {
        routePreviewCommand(
            PREVIEW_COMMANDS,
            message,
            { mode: this.mode, search: window.location.search, diffPreview: this.diffPreview, reply: replyFromPreview },
            PREVIEW_LOG_PREFIX,
        );
    }
}
