import type { AddOnPayload } from "@miragon/bpmn-modeler-shared";

import { needsReview } from "./catalogFilter";

/** What the list selects on its own: the first add-on to review it shows, else its first shown add-on. */
export function firstToShow(
    shown: readonly AddOnPayload[],
    inSight: ReadonlySet<string>,
): string | undefined {
    const visible = shown.filter(({ id }) => inSight.has(id));
    return (visible.find(needsReview) ?? visible[0])?.id;
}

/**
 * The list's selection once it changed: the remembered add-on while the
 * list holds it, even under a closed header; when a filter or a new model
 * removes it, the nearest add-on after it the list still shows, else before
 * it; else {@link firstToShow}. It never picks a row a closed header hides.
 *
 * @param shown the add-ons the list holds, in the order it shows them
 * @param before the ids the list held before the change, in that order
 * @param inSight the rows the list shows under open headers
 */
export function settledSelection(
    remembered: string | undefined,
    shown: readonly AddOnPayload[],
    before: readonly string[],
    inSight: ReadonlySet<string>,
): string | undefined {
    const shownIds = new Set(shown.map(({ id }) => id));
    if (remembered !== undefined && shownIds.has(remembered)) return remembered;
    const index = remembered === undefined ? -1 : before.indexOf(remembered);
    if (index === -1) return firstToShow(shown, inSight);
    const selectable = (id: string) => shownIds.has(id) && inSight.has(id);
    const after = before.slice(index + 1).find(selectable);
    const previous = before.slice(0, index).reverse().find(selectable);
    return after ?? previous ?? firstToShow(shown, inSight);
}
