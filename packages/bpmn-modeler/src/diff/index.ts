/**
 * BPMN diff computation and serializable results for Node and browsers.
 * Browser rendering primitives are available from `@miragon/bpmn-modeler/viewer`.
 */

// Local wrappers prevent API Extractor from emitting bundled function bodies into declarations.
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
