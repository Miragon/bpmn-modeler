import type { ActionViewPayload, CatalogActionKindPayload } from "@miragon/bpmn-modeler-shared";
import { Package, Store } from "lucide";

import { CHROME_TEXT } from "../../domain/chromeTexts";
import { actionButton, button, el, icon, markFocus } from "./dom";
import { CATALOG_ACTION_ICON } from "./icons";

type CatalogButtons = readonly ActionViewPayload<CatalogActionKindPayload>[];

export function loadingOf(): HTMLElement {
    const loading = el("div", "av-loading");
    loading.setAttribute("role", "status");
    loading.append(el("p", "av-loading-text", CHROME_TEXT.loading));
    for (let index = 0; index < 6; index++) {
        loading.append(el("div", `av-skeleton av-skeleton-${index % 3}`));
    }
    return loading;
}

/** The catalog actions a list offers as buttons, labelled by the model. */
export function catalogButtonsOf(buttons: CatalogButtons, busy: boolean): HTMLButtonElement[] {
    return buttons.map((action) =>
        actionButton(action, {
            busy,
            emphasis: "secondary",
            icon: CATALOG_ACTION_ICON[action.kind],
            focus: "scopeAction",
        }),
    );
}

/** "Add marketplace…" and "Update marketplaces" above the marketplaces. */
export function scopeActionsOf(buttons: CatalogButtons, busy: boolean): HTMLElement[] {
    if (buttons.length === 0) return [];
    const bar = el("div", "av-scope-actions");
    bar.append(...catalogButtonsOf(buttons, busy));
    return [bar];
}

/** A failed catalog with nothing to offer leaves the word to its problem. */
export function catalogEmptyOf(
    text: string | undefined,
    buttons: CatalogButtons,
    busy: boolean,
): HTMLElement[] {
    if (text === undefined && buttons.length === 0) return [];
    return [emptyBox(Package, text, buttons, busy)];
}

export function noMarketplaceOf(buttons: CatalogButtons, busy: boolean): HTMLElement {
    return emptyBox(Store, CHROME_TEXT.noMarketplace, buttons, busy);
}

export function workspaceEmptyOf(text: string): HTMLElement {
    return emptyBox(Package, text, [], false);
}

export function noMatchOf(onClear: () => void): HTMLElement {
    const box = el("div", "av-empty");
    const clear = markFocus(button("ds-btn ds-btn-secondary"), "clearFilters");
    clear.append(el("span", "ds-btn-label", CHROME_TEXT.clearFilters));
    clear.addEventListener("click", onClear);
    box.append(el("p", "av-empty-text", CHROME_TEXT.noMatch), clear);
    return box;
}

function emptyBox(
    mark: Parameters<typeof icon>[0],
    text: string | undefined,
    buttons: CatalogButtons,
    busy: boolean,
): HTMLElement {
    const box = el("div", "av-empty");
    box.append(icon(mark, 16, "av-empty-icon"));
    if (text !== undefined) box.append(el("p", "av-empty-text", text));
    if (buttons.length > 0) {
        const actions = el("div", "av-empty-actions");
        actions.append(...catalogButtonsOf(buttons, busy));
        box.append(actions);
    }
    if (busy) box.append(el("div", "ds-busy-bar av-empty-busy"));
    return box;
}
