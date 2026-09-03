/**
 * `@miragon/bpmn-modeler/diff` — the Node- and browser-safe diff data layer.
 *
 * Surfaces the pure computation and its serializable result types from the
 * inlined `@miragon/bpmn-modeler-diff` lib. This entry pulls in no CSS, no
 * bpmn-js, no i18n, and no preact, so it runs under plain Node (mechanised by
 * scripts/check-diff-node.mjs). The rendering primitives (DiffViewer,
 * DiffLegend, DiffNavigator, DiffPaneCoordinator) live on the `/viewer` entry.
 *
 * `computeDiff` / `sideView` are re-published as thin local wrappers rather than
 * bare `export … from`: api-extractor resolves a bundled lib via its
 * `types: ./src/index.ts` source, so a direct function re-export would inline
 * the implementation *body* into the rolled-up `dist/diff.d.ts` (invalid ambient
 * output). A local wrapper is emitted from the package's own source, so the dts
 * plugin produces a clean declaration; the return/parameter types still inline
 * cleanly because they carry no body.
 */
import {
    computeDiff as computeDiffData,
    sideView as sideViewData,
} from "@miragon/bpmn-modeler-diff";
import type { DiffResult, DiffSide, DiffSideView } from "@miragon/bpmn-modeler-diff";

export type { DiffSide, DiffCounts, DiffResult, DiffSideView } from "@miragon/bpmn-modeler-diff";

/** {@inheritDoc @miragon/bpmn-modeler-diff#computeDiff} */
export function computeDiff(beforeXml: string, afterXml: string): Promise<DiffResult> {
    return computeDiffData(beforeXml, afterXml);
}

/** {@inheritDoc @miragon/bpmn-modeler-diff#sideView} */
export function sideView(result: DiffResult, side: DiffSide): DiffSideView {
    return sideViewData(result, side);
}
