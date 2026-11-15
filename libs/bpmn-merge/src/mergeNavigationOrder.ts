import { buildFlowOrder, buildRemovedAnchors, sortIdsByOrder } from "@miragon/bpmn-modeler-diff";

import type { MergeSources } from "./buildMergedSources";
import type { MergeResult } from "./mergeResult";

/**
 * Every merge element in the order a stepper walks them: current's flow from
 * start to end, an element current lacks next to its neighbour in incoming's
 * flow, and the elements no flow reaches (root elements, pools, lanes, the
 * process) at the end in result order.
 */
export async function mergeNavigationOrder(
    result: MergeResult,
    sources: MergeSources,
): Promise<readonly string[]> {
    const { moddle } = sources.mergeModdle;
    const [currentRoot, incomingRoot] = await Promise.all([
        moddle.fromXML(sources.versions.current),
        moddle.fromXML(sources.versions.incoming),
    ]);
    const currentOrder = buildFlowOrder(currentRoot.rootElement);
    const notInCurrent = result.elements
        .filter(({ versions }) => versions.current === undefined)
        .map(({ id }) => id);
    const anchors = buildRemovedAnchors(notInCurrent, incomingRoot.rootElement, currentOrder);
    return sortIdsByOrder(
        result.elements.map(({ id }) => id),
        currentOrder,
        anchors,
    );
}
