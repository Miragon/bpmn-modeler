import { Ellipsis } from "lucide";

import { button, CATALOG_OWNER, el, icon, markFocus } from "./dom";

/** The id of the catalog's "More actions" menu; a source's menu goes by the source's id. */
export const CATALOG_MENU = CATALOG_OWNER;

/**
 * A "…" button with its menu. The view keeps which menu is open; the items
 * are action buttons, so the view's click handler sends them and closes the
 * menu. A menu keeps the arrow keys its role asks for.
 */
export function menuAnchor(
    menuId: string,
    label: string,
    open: boolean,
    items: readonly HTMLButtonElement[],
    onToggle: (menuId: string) => void,
): HTMLElement {
    const anchor = el("div", "av-menu-anchor");
    const opener = markFocus(button("ds-icon-btn av-menu-trigger", label), "menu", menuId);
    opener.setAttribute("aria-haspopup", "menu");
    opener.setAttribute("aria-expanded", String(open));
    opener.append(icon(Ellipsis, 16));
    opener.addEventListener("click", () => onToggle(menuId));
    anchor.append(opener);
    if (!open) return anchor;
    const menu = el("div", "av-menu");
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", label);
    items.forEach((item) => {
        item.setAttribute("role", "menuitem");
        item.tabIndex = -1;
        item.classList.add("av-menu-item");
    });
    menu.append(...items);
    menu.addEventListener("keydown", (event) => moveInMenu(menu, event));
    anchor.append(menu);
    return anchor;
}

const STEP: Readonly<Record<string, (index: number, count: number) => number>> = {
    ArrowDown: (index, count) => (index + 1) % count,
    ArrowUp: (index, count) => (index - 1 + count) % count,
    Home: () => 0,
    End: (_, count) => count - 1,
};

function moveInMenu(menu: HTMLElement, event: KeyboardEvent): void {
    const step = STEP[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const items = [...menu.querySelectorAll<HTMLElement>(MENU_ITEMS)];
    const index = items.indexOf(document.activeElement as HTMLElement);
    items[step(index, items.length)]?.focus();
}

export const MENU_ITEMS = "[role=menuitem]";
