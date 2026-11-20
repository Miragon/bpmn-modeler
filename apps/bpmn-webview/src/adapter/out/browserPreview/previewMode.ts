import { previewModeOf } from "@miragon/bpmn-modeler-shared";
import type { DiffSide } from "@miragon/bpmn-modeler-types";

/**
 * The browser preview's `?mode=` values.
 *
 * `modeler` (default) — serves the full editable modeler.
 * `neutral` — serves an untagged (engine-neutral) model with `engine: undefined`
 *   so the webview opens it in Design and greys out Implement.
 * `diff-before` / `diff-after` — serves the left or right pane of a diff view
 *   with real `bpmn-js-differ` highlights computed from two fixture XMLs.
 * `merge-current` / `merge-incoming` — the same diagrams as the two panes of a
 *   merge view, with the recorded merge states of a merge of `feature` into `main`.
 */
export const PREVIEW_MODES = [
    "modeler",
    "neutral",
    "diff-before",
    "diff-after",
    "merge-current",
    "merge-incoming",
] as const;

export type PreviewMode = (typeof PREVIEW_MODES)[number];

/** The diff or merge pane a mode shows. */
export interface PreviewPane {
    readonly kind: "diff" | "merge";
    readonly side: DiffSide;
}

const PANES: Readonly<Record<PreviewMode, PreviewPane | undefined>> = {
    modeler: undefined,
    neutral: undefined,
    "diff-before": { kind: "diff", side: "before" },
    "diff-after": { kind: "diff", side: "after" },
    "merge-current": { kind: "merge", side: "before" },
    "merge-incoming": { kind: "merge", side: "after" },
};

export function paneOf(mode: PreviewMode): PreviewPane | undefined {
    return PANES[mode];
}

export function readPreviewMode(search: string): PreviewMode {
    return previewModeOf(search, PREVIEW_MODES);
}
