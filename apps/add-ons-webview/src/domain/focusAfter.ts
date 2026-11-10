import type { AddOnCatalogPayload, CatalogActionKindPayload } from "@miragon/bpmn-modeler-shared";

import type { ActionKindPayload } from "./actionRequest";
import { placementOf, sourceOf } from "./catalogQueries";
import { headsOf } from "./expansion";
import { reviewOf } from "./placedActions";

export type FocusTarget =
    /** `reveal`: a "Review…" asked for it, so it may take focus the page does not hold yet. */
    | { readonly kind: "head"; readonly headId: string; readonly reveal?: true }
    | { readonly kind: "review"; readonly addOnId: string }
    /** The button at this place among its add-on's or source's actions. */
    | { readonly kind: "action"; readonly targetId: string; readonly slot: number }
    | { readonly kind: "toolbar"; readonly actionKind: CatalogActionKindPayload };

type AfterDone = (targetId: string, slot: number) => FocusTarget;

const toRow: AfterDone = (targetId) => ({ kind: "head", headId: targetId });
const toSlot: AfterDone = (targetId, slot) => ({ kind: "action", targetId, slot });
const toToolbar =
    (actionKind: CatalogActionKindPayload): AfterDone =>
    () => ({ kind: "toolbar", actionKind });

/**
 * After a code action the row's buttons change (Allow becomes Revoke), so
 * focus goes back to the row: Enter, Enter must not allow and revoke at once.
 * A switch swaps in place, so focus stays where it was.
 */
const AFTER_DONE: Record<ActionKindPayload, AfterDone> = {
    allow: toRow,
    revoke: toRow,
    inspect: (targetId) => ({ kind: "review", addOnId: targetId }),
    enable: toSlot,
    disable: toSlot,
    enableTemplates: toSlot,
    disableTemplates: toSlot,
    removeMarketplace: toSlot,
    addMarketplace: toToolbar("addMarketplace"),
    updateMarketplaces: toToolbar("updateMarketplaces"),
    pruneCache: toToolbar("pruneCache"),
};

export function focusAfterDone(
    actionKind: ActionKindPayload,
    targetId: string,
    slot: number,
): FocusTarget {
    return AFTER_DONE[actionKind](targetId, slot);
}

/**
 * Whether the model holds the target, so focus can go to it now. The view
 * finds a place on screen for any target the model holds: a row hidden in a
 * closed source or behind the detail pane leaves focus with its detail.
 */
export function isFocusable(target: FocusTarget, model: AddOnCatalogPayload): boolean {
    switch (target.kind) {
        case "head":
            return isListed(model, target.headId);
        case "review": {
            const addOn = placementOf(model.groups, target.addOnId)?.addOn;
            return addOn !== undefined && reviewOf(addOn) !== undefined;
        }
        case "action":
            return actionsOf(model, target.targetId).length > target.slot;
        case "toolbar":
            return model.actions.some(({ kind }) => kind === target.actionKind);
    }
}

/** A head is a group, a source or an add-on's row. */
export function isListed(model: AddOnCatalogPayload, id: string): boolean {
    return headsOf(model).some((head) => head.id === id);
}

function actionsOf(model: AddOnCatalogPayload, id: string): readonly unknown[] {
    return (
        sourceOf(model.groups, id)?.actions ?? placementOf(model.groups, id)?.addOn.actions ?? []
    );
}
