import type { MergeSources } from "./buildMergedSources";
import { orderMembers } from "./mergedTreeOrder";
import type { MergeResult } from "./mergeResult";

/**
 * Every merge element in the order a stepper walks them: current's flow from
 * start to end, an element only incoming's flow places after its nearest
 * predecessor there, and the elements no flow reaches (root elements, pools,
 * lanes, the process) at the end in result order.
 */
export function mergeNavigationOrder(
    result: MergeResult,
    sources: MergeSources,
): readonly string[] {
    return orderMembers(
        sources.flowOrders.current,
        sources.flowOrders.incoming,
        new Set(result.elements.map(({ id }) => id)),
    );
}
