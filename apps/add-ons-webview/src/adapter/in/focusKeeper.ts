import type { FocusTarget } from "../../domain/focusAfter";
import { CATALOG_OWNER, elementAt, FocusPlace, focusPlaceOf } from "./dom";
import type { Layout } from "./layout";

/** A focused control and its place among its owner's buttons: a switch swaps in place. */
export type HeldFocus = FocusPlace & { readonly slot?: number };

/**
 * Finds a place on screen for focus: the target the reducer names, the
 * control a render rebuilt, or the nearest one left. A place a container
 * query hides, as the list behind the drill-down's detail, never takes it.
 */
export class FocusKeeper {
    constructor(
        private readonly root: HTMLElement,
        private readonly list: HTMLElement,
        private readonly layout: Layout,
        private readonly focusTab: () => void,
    ) {}

    held(): HeldFocus | undefined {
        const focused = document.activeElement;
        if (focused === null || !this.root.contains(focused)) return undefined;
        const place = focusPlaceOf(focused);
        if (place?.owner === undefined) return place;
        return { ...place, slot: this.ownedButtons(place.owner).indexOf(focused as HTMLElement) };
    }

    apply(focus: FocusTarget): void {
        switch (focus.kind) {
            case "head": {
                const id = focus.headId;
                const places: FocusPlace[] = [
                    ...placesOfAddOn(id),
                    { kind: "head", id },
                    { kind: "menu", id },
                ];
                if (!this.first(places)) this.listStart();
                return;
            }
            case "review":
                this.first([
                    { kind: "review", id: focus.addOnId },
                    { kind: "name", id: focus.addOnId },
                ]);
                return;
            case "action": {
                const buttons = this.ownedButtons(focus.targetId);
                const button = buttons[focus.slot] ?? buttons[0];
                if (button !== undefined && this.layout.isShown(button)) button.focus();
                else
                    this.first([
                        { kind: "menu", id: focus.targetId },
                        ...placesOfAddOn(focus.targetId),
                    ]);
                return;
            }
            case "toolbar":
                this.first([
                    { kind: "scopeAction", id: `${CATALOG_OWNER}|${focus.actionKind}` },
                    { kind: "menu", id: CATALOG_OWNER },
                ]);
                return;
            case "listStart":
                this.listStart();
                return;
        }
    }

    /**
     * A render removed the focused control, as a chosen menu item or a removed
     * row: the nearest one left, else the add-on the tab selected in its place.
     */
    recover(lost: HeldFocus, selectedId: string | undefined): void {
        if (this.root.contains(document.activeElement) || this.first([lost])) return;
        const owner = lost.owner;
        if (owner !== undefined) {
            const swapped = this.ownedButtons(owner)[lost.slot ?? -1];
            if (swapped !== undefined && this.layout.isShown(swapped)) {
                swapped.focus();
                return;
            }
            if (this.first([{ kind: "menu", id: owner }, ...placesOfAddOn(owner)])) return;
        }
        if (selectedId !== undefined && this.addOn(selectedId)) return;
        this.listStart();
    }

    /** Where an add-on shows: its row in the list, else the heading of its detail. */
    addOn(addOnId: string): boolean {
        return this.first(placesOfAddOn(addOnId));
    }

    /** Focus must not fall to the page: the list's first control, else the active tab. */
    listStart(): void {
        const first = [...this.list.querySelectorAll<HTMLElement>("[data-focus]")].find((each) =>
            this.layout.isShown(each),
        );
        if (first !== undefined) first.focus();
        else this.focusTab();
    }

    first(places: readonly FocusPlace[]): boolean {
        for (const place of places) {
            const target = elementAt(this.root, place);
            if (target !== null && this.layout.isShown(target)) {
                target.focus();
                return true;
            }
        }
        return false;
    }

    private ownedButtons(owner: string): HTMLElement[] {
        const selector = `[data-target-id="${CSS.escape(owner)}"]`;
        return [...this.root.querySelectorAll<HTMLElement>(selector)];
    }
}

function placesOfAddOn(addOnId: string): FocusPlace[] {
    return [
        { kind: "row", id: addOnId },
        { kind: "name", id: addOnId },
    ];
}
