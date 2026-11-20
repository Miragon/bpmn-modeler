import type { DmnDiffPaneCommandType, PreviewCommandTable, Query } from "@miragon/bpmn-modeler-shared";
import type { DiffSide } from "@miragon/bpmn-modeler-types";

import { diffPaneDocument, diffPaneHighlights } from "./diffPreview";

/** The side a diff pane command arrives from, and the way back to it. */
export interface DiffPanePreviewSession {
    readonly side: DiffSide;
    reply(query: Query): void;
}

const NO_PARTNER_PANE = "a single pane has no partner pane to follow it";

export const DIFF_PANE_PREVIEW_COMMANDS: PreviewCommandTable<
    DmnDiffPaneCommandType,
    DiffPanePreviewSession
> = {
    GetDmnFileCommand: (_, pane) => pane.reply(diffPaneDocument(pane.side)),
    DiffReadyCommand: (_, pane) => void diffPaneHighlights(pane.side).then(pane.reply),
    LogErrorCommand: ({ message }) => console.error(message),
    ViewportChangedCommand: { ignored: NO_PARTNER_PANE },
    CursorChangedCommand: { ignored: NO_PARTNER_PANE },
    SwapCompareSidesCommand: { ignored: NO_PARTNER_PANE },
    DmnDiffViewChangedCommand: { ignored: NO_PARTNER_PANE },
    DmnDiffScrollChangedCommand: { ignored: NO_PARTNER_PANE },
};

export const DIFF_PANE_PREVIEW_LOG_PREFIX = "[dev]";
