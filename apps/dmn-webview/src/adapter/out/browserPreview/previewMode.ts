import { previewModeOf } from "@miragon/bpmn-modeler-shared";
import type { DiffSide } from "@miragon/bpmn-modeler-types";


/**
 * The browser preview's `?mode=` values.
 *
 * `modeler` (default) — serves the sample decision in the editable modeler.
 * `diff-before` / `diff-after` — serves one side of the shipping change as a
 *   compare-files diff pane, with its real diff.
 */
const PREVIEW_MODES = ["modeler", "diff-before", "diff-after"] as const;

export type PreviewMode = (typeof PREVIEW_MODES)[number];

const DIFF_SIDES: Readonly<Record<PreviewMode, DiffSide | undefined>> = {
    modeler: undefined,
    "diff-before": "before",
    "diff-after": "after",
};

export function diffSideOf(mode: PreviewMode): DiffSide | undefined {
    return DIFF_SIDES[mode];
}

export function readPreviewMode(search: string): PreviewMode {
    return previewModeOf(search, PREVIEW_MODES);
}
