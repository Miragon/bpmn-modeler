import { ApplyDiffHighlightsQuery } from "@miragon/bpmn-modeler-shared";
import type { DiffSide } from "@miragon/bpmn-modeler-types";
import type { DiffResult } from "@miragon/bpmn-modeler/diff";

import { MOCK_DIFF_AFTER_XML, MOCK_DIFF_BEFORE_XML } from "../../../__fixtures__/mock-diff";

/**
 * Paints a diff pane with the real highlights of the two fixture diagrams,
 * computed once per preview.
 */
export class DiffPreview {
    private cachedDiff: DiffResult | undefined;

    /** Undefined when the fixture diff fails: the pane stays unpainted. */
    async highlightsFor(side: DiffSide): Promise<ApplyDiffHighlightsQuery | undefined> {
        let result: DiffResult;
        try {
            result = await this.ensureCachedDiff();
        } catch (error) {
            console.error("[dev] Failed to compute mock diff; diff highlights unavailable.", error);
            return undefined;
        }

        const { sideView } = await import("@miragon/bpmn-modeler/diff");
        const view = sideView(result, side);

        return new ApplyDiffHighlightsQuery(
            side,
            view.added,
            view.removed,
            view.changed,
            view.layoutChanged,
            result.counts,
            result.navigationOrder,
            // Dev preview mimics the "Compare Files" entry point so the legend
            // renders its filename, the branch that exercises the most chrome.
            "compare-files",
            side === "before" ? "before.bpmn" : "after.bpmn",
            // Shows the context pad's "Show XML changes" entry in the preview.
            { elementXmlChanges: true },
        );
    }

    private async ensureCachedDiff(): Promise<DiffResult> {
        if (this.cachedDiff) {
            return this.cachedDiff;
        }

        // Dynamic import keeps the diff data layer (and its ~200 KB of
        // bpmn-moddle/bpmn-js-differ deps) out of the production webview bundle:
        // Rollup emits it as a separate chunk that the dead-code-eliminated
        // preview host never loads when NODE_ENV is production.
        const { computeDiff } = await import("@miragon/bpmn-modeler/diff");
        this.cachedDiff = await computeDiff(MOCK_DIFF_BEFORE_XML, MOCK_DIFF_AFTER_XML);
        return this.cachedDiff;
    }
}
