import type { AddOnGroupPayload } from "@miragon/bpmn-modeler-shared";

import { needsReview } from "./catalogFilter";
import { addOnsOf } from "./catalogQueries";

/** What a tab selects first: the first add-on to review, else its first add-on. */
export function firstToShow(groups: readonly AddOnGroupPayload[]): string | undefined {
    const addOns = addOnsOf(groups);
    return (addOns.find(needsReview) ?? addOns[0])?.id;
}

/**
 * The tab's selection once the list changed: the remembered add-on while the
 * list shows it; when a filter or a new model hides it, the nearest add-on
 * after it the list still shows, else before it; else {@link firstToShow}.
 *
 * @param before the ids the tab's list showed before the change
 */
export function settledSelection(
    remembered: string | undefined,
    shown: readonly AddOnGroupPayload[],
    before: readonly string[],
): string | undefined {
    const shownIds = new Set(addOnsOf(shown).map(({ id }) => id));
    if (remembered !== undefined && shownIds.has(remembered)) return remembered;
    const index = remembered === undefined ? -1 : before.indexOf(remembered);
    if (index === -1) return firstToShow(shown);
    const after = before.slice(index + 1).find((id) => shownIds.has(id));
    const previous = before
        .slice(0, index)
        .reverse()
        .find((id) => shownIds.has(id));
    return after ?? previous ?? firstToShow(shown);
}
