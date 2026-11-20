import {
    type DmnDiffPaneCommand,
    MockHostApi,
    replyFromPreview,
    routePreviewCommand,
} from "@miragon/bpmn-modeler-shared";
import type { DiffSide } from "@miragon/bpmn-modeler-types";

import type { WebviewState } from "../../../port/dmnHost";
import { DIFF_PANE_PREVIEW_COMMANDS } from "./diffPanePreviewCommands";
import { PREVIEW_LOG_PREFIX } from "./previewCommands";

/** One side of a compare-files diff of the shipping change, without a partner pane. */
export class DiffPanePreviewHost extends MockHostApi<WebviewState, DmnDiffPaneCommand> {
    constructor(private readonly side: DiffSide) {
        super();
    }

    override postMessage(message: DmnDiffPaneCommand): void {
        routePreviewCommand(
            DIFF_PANE_PREVIEW_COMMANDS,
            message,
            { side: this.side, reply: replyFromPreview },
            PREVIEW_LOG_PREFIX,
        );
    }
}
