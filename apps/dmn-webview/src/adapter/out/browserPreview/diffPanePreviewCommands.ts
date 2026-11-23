import {
    type DmnDiffPaneCommand,
    logPreviewError,
    PREVIEW_NO_PARTNER_PANE,
    type PreviewCommandTable,
    type Query,
} from "@miragon/bpmn-modeler-shared";
import type { DiffSide } from "@miragon/bpmn-modeler-types";

import { diffPaneDocument, diffPaneHighlights } from "./diffPreview";

/** The side a diff pane command arrives from, and the way back to it. */
export interface DiffPanePreviewSession {
    readonly side: DiffSide;
    reply(query: Query): void;
}

export const DIFF_PANE_PREVIEW_COMMANDS: PreviewCommandTable<
    DmnDiffPaneCommand,
    DiffPanePreviewSession
> = {
    GetDmnFileCommand: (_, pane) => pane.reply(diffPaneDocument(pane.side)),
    DiffReadyCommand: (_, pane) => void diffPaneHighlights(pane.side).then(pane.reply),
    LogErrorCommand: logPreviewError,
    ViewportChangedCommand: { ignored: PREVIEW_NO_PARTNER_PANE },
    CursorChangedCommand: { ignored: PREVIEW_NO_PARTNER_PANE },
    SwapCompareSidesCommand: { ignored: PREVIEW_NO_PARTNER_PANE },
    DmnDiffViewChangedCommand: { ignored: PREVIEW_NO_PARTNER_PANE },
    DmnDiffScrollChangedCommand: { ignored: PREVIEW_NO_PARTNER_PANE },
};
