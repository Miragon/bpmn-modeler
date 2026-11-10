import type { AddOnCatalogPayload } from "@miragon/bpmn-modeler-shared";
import { Search, X } from "lucide";

import { AddOnKind, catalogCounts, KIND_ORDER } from "../../domain/catalogFilter";
import { CatalogScope, scopeAfterKey, scopedCatalog, SCOPE_ORDER } from "../../domain/catalogScope";
import { CHROME_TEXT, KIND_TEXT, SCOPE_TEXT } from "../../domain/chromeTexts";
import { CATALOG_TARGET, isBusy, ViewState } from "../../domain/viewState";
import { actionButton, button, el, icon, markFocus, setBusy } from "./dom";
import { CATALOG_ACTION_ICON } from "./icons";
import { CATALOG_MENU, menuAnchor } from "./menu";
import { kindTile } from "./statusMarks";

export interface ToolbarHandlers {
    readonly onScope: (scope: CatalogScope, byKey: boolean) => void;
    readonly onQuery: (query: string) => void;
    readonly onKind: (kind: AddOnKind) => void;
    readonly onNeedsReview: () => void;
    readonly onMenu: (menuId: string) => void;
}

interface Chip {
    readonly button: HTMLButtonElement;
    readonly count: HTMLElement;
}

export function tabIdOf(scope: CatalogScope): string {
    return `av-tab-${scope}`;
}

/**
 * The tabs, the search, the filter chips and the "More actions" menu. Every
 * control but the menu keeps its element across renders, so typing and
 * arrowing never lose focus.
 */
export class Toolbar {
    readonly element = el("header", "av-toolbar");
    private readonly tabs = new Map<CatalogScope, Chip>();
    private readonly input = el("input", "ds-search-input");
    private readonly clear = button("ds-search-clear", CHROME_TEXT.clearSearch);
    private readonly needsReview: Chip;
    private readonly kinds = new Map<AddOnKind, Chip>();
    private readonly menuSlot = el("div", "av-toolbar-menu");
    private readonly busyBar = el("div", "ds-busy-bar");

    constructor(
        listPanelId: string,
        private readonly handlers: ToolbarHandlers,
    ) {
        const tablist = el("div", "av-tabs");
        tablist.setAttribute("role", "tablist");
        tablist.setAttribute("aria-label", CHROME_TEXT.scopes);
        SCOPE_ORDER.forEach((scope) => {
            const tab = tabOf(scope, listPanelId, () => handlers.onScope(scope, false));
            this.tabs.set(scope, tab);
            tablist.append(tab.button);
        });
        tablist.addEventListener("keydown", (event) => this.moveInTabs(event));
        const searchRow = el("div", "av-search-row");
        searchRow.append(this.searchField(), this.menuSlot);
        const chips = el("div", "av-chips");
        chips.setAttribute("role", "group");
        chips.setAttribute("aria-label", CHROME_TEXT.filters);
        this.needsReview = chipOf("review", CHROME_TEXT.needsReview, el("span", "av-dot"));
        this.needsReview.button.classList.add("av-chip-review");
        this.needsReview.button.addEventListener("click", () => handlers.onNeedsReview());
        chips.append(this.needsReview.button);
        KIND_ORDER.forEach((kind) => {
            const chip = chipOf(kind, KIND_TEXT[kind].plural, kindTile(kind, true));
            chip.button.addEventListener("click", () => handlers.onKind(kind));
            this.kinds.set(kind, chip);
            chips.append(chip.button);
        });
        chips.addEventListener("wheel", (event) => scrollSideways(chips, event), {
            passive: false,
        });
        const busy = el("div", "av-toolbar-busy");
        busy.append(this.busyBar);
        this.element.append(tablist, searchRow, chips, busy);
    }

    /** Counts and actions of the active tab: the scope comes first, the filter applies inside it. */
    update(model: AddOnCatalogPayload, state: ViewState, openMenu: string | undefined): void {
        const { filter } = state;
        this.tabs.forEach((tab, scope) => {
            const selected = scope === state.scope;
            tab.button.setAttribute("aria-selected", String(selected));
            tab.button.tabIndex = selected ? 0 : -1;
            setCount(tab, catalogCounts(scopedCatalog(model, scope)).total);
        });
        if (this.input.value !== filter.query) this.input.value = filter.query;
        this.clear.hidden = filter.query === "";
        const counts = catalogCounts(scopedCatalog(model, state.scope));
        setPressed(this.needsReview, filter.onlyNeedsReview, counts.needsReview);
        this.kinds.forEach((chip, kind) =>
            setPressed(chip, filter.kinds.has(kind), counts.byKind[kind]),
        );
        const busy = isBusy(state, CATALOG_TARGET);
        setBusy(this.element, busy);
        this.busyBar.hidden = !busy;
        this.menuSlot.replaceChildren(...this.catalogMenu(model, busy, openMenu));
    }

    focusSearch(): void {
        this.input.focus();
    }

    focusTab(scope: CatalogScope): void {
        this.tabs.get(scope)?.button.focus();
    }

    private catalogMenu(
        model: AddOnCatalogPayload,
        busy: boolean,
        openMenu: string | undefined,
    ): HTMLElement[] {
        if (model.actions.length === 0) return [];
        const items = model.actions.map((action) =>
            actionButton(action, {
                busy,
                emphasis: "ghost",
                icon: CATALOG_ACTION_ICON[action.kind],
                focus: "action",
            }),
        );
        const open = openMenu === CATALOG_MENU;
        return [
            menuAnchor(CATALOG_MENU, CHROME_TEXT.moreActions, open, items, this.handlers.onMenu),
        ];
    }

    private searchField(): HTMLElement {
        const box = el("div", "ds-search av-search");
        this.input.type = "search";
        this.input.placeholder = CHROME_TEXT.search;
        this.input.setAttribute("aria-label", CHROME_TEXT.search);
        this.input.spellcheck = false;
        this.clear.append(icon(X, 14));
        this.input.addEventListener("input", () => this.handlers.onQuery(this.input.value));
        this.input.addEventListener("keydown", (event) => {
            if (event.key !== "Escape" || this.input.value === "") return;
            event.preventDefault();
            this.handlers.onQuery("");
        });
        this.clear.addEventListener("click", () => {
            this.handlers.onQuery("");
            this.input.focus();
        });
        box.append(icon(Search, 16, "ds-search-icon"), this.input, this.clear);
        return box;
    }

    private moveInTabs(event: KeyboardEvent): void {
        const current = [...this.tabs].find(([, tab]) => tab.button === event.target)?.[0];
        const next = current && scopeAfterKey(event.key, current);
        if (next === undefined) return;
        event.preventDefault();
        this.handlers.onScope(next, true);
    }
}

function tabOf(scope: CatalogScope, listPanelId: string, onPick: () => void): Chip {
    const tab = markFocus(button("av-tab"), "tab", scope);
    tab.id = tabIdOf(scope);
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", listPanelId);
    const label = el("span", "av-tab-label", SCOPE_TEXT[scope]);
    // Reserves the selected weight, so choosing a tab never shifts the toolbar.
    label.dataset.label = SCOPE_TEXT[scope];
    const count = el("span", "ds-count");
    tab.append(label, count);
    tab.addEventListener("click", onPick);
    return { button: tab, count };
}

function chipOf(id: string, label: string, lead: HTMLElement): Chip {
    const chip = markFocus(button("ds-chip av-chip"), "chip", id);
    const count = el("span", "ds-count");
    chip.append(lead, el("span", "av-chip-label", label), count);
    return { button: chip, count };
}

function setCount(chip: Chip, count: number): void {
    const text = String(count);
    if (chip.count.textContent !== text) chip.count.textContent = text;
}

function setPressed(chip: Chip, pressed: boolean, count: number): void {
    chip.button.setAttribute("aria-pressed", String(pressed));
    setCount(chip, count);
}

/** A mouse wheel has no horizontal axis: it scrolls the chip row when that overflows. */
function scrollSideways(chips: HTMLElement, event: WheelEvent): void {
    const overflows = chips.scrollWidth > chips.clientWidth;
    if (!overflows || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    chips.scrollLeft += event.deltaY;
}
