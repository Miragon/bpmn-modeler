import type { MergeSources } from "./buildMergedSources";
import type { MergeDecisions } from "./mergeDecisions";
import { otherSide } from "./mergeResult";

/**
 * The names of the elements a view names by id, the same on both panes: as
 * the side the merge takes each from names it, by its version merged by hand
 * where there is one, current's while it is open, or the other side's where
 * that side has no name. An element no side names is left out.
 */
export function mergeElementNames(
    sources: MergeSources,
    decisions: MergeDecisions,
    ids: Iterable<string>,
): Readonly<Record<string, string>> {
    const names: Record<string, string> = {};
    for (const id of ids) {
        const side = decisions.sideOf(id) ?? "current";
        const handMerge = decisions.handMergeOf(id);
        const sideName =
            handMerge?.side === side ? handMerge.attributes["name"] : sources.names[side].get(id);
        const name = sideName ?? sources.names[otherSide(side)].get(id);
        if (name !== undefined) names[id] = name;
    }
    return names;
}
