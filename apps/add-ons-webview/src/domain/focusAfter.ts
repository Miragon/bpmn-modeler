import type {
    AddOnActionKindPayload,
    AddOnCatalogPayload,
    AddOnPayload,
    CatalogActionKindPayload,
    SourceActionKindPayload,
} from "@miragon/bpmn-modeler-shared";

import { Expansion, OutlineHead, visibleHeadsOf } from "./outline";

export type ActionKindPayload =
    AddOnActionKindPayload | SourceActionKindPayload | CatalogActionKindPayload;

export type FocusTarget =
    /** `reveal`: a "Review…" asked for it, so it may take focus the page does not hold yet. */
    | { readonly kind: "head"; readonly headId: string; readonly reveal?: true }
    | { readonly kind: "review"; readonly addOnId: string }
    /** The button at this place among its row's or source's actions. */
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

/** Where focus goes once a push removed the focused head: a sibling, else the parent, else the first head. */
export function neighbourAfterRemoval(
    removedId: string,
    previous: readonly OutlineHead[],
    next: readonly OutlineHead[],
): string | undefined {
    const stillShown = new Set(next.map(({ id }) => id));
    const index = previous.findIndex(({ id }) => id === removedId);
    const parentId = previous[index]?.parentId;
    const siblings = (heads: readonly OutlineHead[]) =>
        heads.filter((head) => head.parentId === parentId && stillShown.has(head.id));
    const after = siblings(previous.slice(index + 1))[0];
    const before = siblings(previous.slice(0, index)).at(-1);
    const parent = parentId !== undefined && stillShown.has(parentId) ? parentId : undefined;
    return after?.id ?? before?.id ?? parent ?? next[0]?.id;
}

/** Whether the target is on screen in this model, so focus can go to it now. */
export function isFocusable(
    target: FocusTarget,
    model: AddOnCatalogPayload,
    expansion: Expansion,
): boolean {
    const visible = new Set(visibleHeadsOf(model, expansion).map(({ id }) => id));
    switch (target.kind) {
        case "head":
            return visible.has(target.headId);
        case "review":
            return (
                visible.has(target.addOnId) && addOnOf(model, target.addOnId)?.review !== undefined
            );
        case "action":
            return (
                visible.has(target.targetId) &&
                actionsOf(model, target.targetId).length > target.slot
            );
        case "toolbar":
            return model.actions.some(({ kind }) => kind === target.actionKind);
    }
}

function addOnOf(
    model: AddOnCatalogPayload,
    id: string,
): (AddOnPayload & { readonly review?: unknown }) | undefined {
    return model.groups
        .flatMap(({ sources }) => sources.flatMap(({ addOns }) => addOns))
        .find((addOn) => addOn.id === id);
}

function actionsOf(model: AddOnCatalogPayload, id: string): readonly unknown[] {
    const source = model.groups.flatMap(({ sources }) => sources).find((each) => each.id === id);
    return source?.actions ?? addOnOf(model, id)?.actions ?? [];
}
