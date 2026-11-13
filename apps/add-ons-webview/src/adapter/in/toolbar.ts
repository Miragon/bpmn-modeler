import type { AddOnCatalogPayload } from "@miragon/bpmn-modeler-shared";
import { Check, ListFilter, Search, X } from "lucide";

import { AddOnKind, catalogCounts, KIND_ORDER } from "../../domain/catalogFilter";
import { CHROME_TEXT, filterLabelText, KIND_TEXT, summaryText } from "../../domain/chromeTexts";
import { CATALOG_TARGET, isBusy, ViewState } from "../../domain/viewState";
import { actionButton, button, el, icon, markFocus, setBusy } from "./dom";
import { CATALOG_ACTION_ICON, KIND_ICON } from "./icons";
import { CATALOG_MENU, menuAnchor } from "./menu";

/** The id of the kind filter's menu. */
export const FILTER_MENU = "filters";

const SEARCH_ID = "av-search";

export interface ToolbarHandlers {
    readonly onQuery: (query: string) => void;
    readonly onKind: (kind: AddOnKind) => void;
    readonly onMenu: (menuId: string) => void;
    readonly onSearchToggle: () => void;
}

/**
 * One line: what needs attention, a search button, the kind filter and the
 * "More actions" menu; the search field opens below it. The search keeps its
 * elements across renders, so typing never loses focus.
 */
export class Toolbar {
    readonly element = el("header", "av-toolbar");
    private readonly summary = el("p", "av-summary");
    private readonly searchToggle = markFocus(
        button("ds-icon-btn av-search-toggle", CHROME_TEXT.search),
        "searchToggle",
    );
    private readonly searchRow = el("div", "av-search-row");
    private readonly input = el("input", "ds-search-input");
    private readonly clear = button("ds-search-clear", CHROME_TEXT.clearSearch);
    private readonly menus = el("div", "av-toolbar-menus");
    private readonly busyBar = el("div", "ds-busy-bar");

    constructor(private readonly handlers: ToolbarHandlers) {
        this.searchToggle.append(icon(Search, 16));
        this.searchToggle.setAttribute("aria-controls", SEARCH_ID);
        this.searchToggle.addEventListener("click", () => handlers.onSearchToggle());
        const line = el("div", "av-toolbar-line");
        line.append(this.summary, this.searchToggle, this.menus);
        this.searchRow.append(this.searchField());
        this.searchRow.id = SEARCH_ID;
        const busy = el("div", "av-toolbar-busy");
        busy.append(this.busyBar);
        this.element.append(line, this.searchRow, busy);
    }

    update(
        model: AddOnCatalogPayload,
        state: ViewState,
        openMenu: string | undefined,
        searchOpen: boolean,
    ): void {
        const { filter } = state;
        const counts = catalogCounts(model);
        const summary = summaryText(counts.needsReview, counts.problems);
        if (this.summary.textContent !== summary) this.summary.textContent = summary;
        const shown = searchOpen || filter.query !== "";
        this.searchRow.hidden = !shown;
        this.searchToggle.setAttribute("aria-expanded", String(shown));
        if (this.input.value !== filter.query) this.input.value = filter.query;
        this.clear.hidden = filter.query === "";
        const busy = isBusy(state, CATALOG_TARGET);
        setBusy(this.element, busy);
        this.busyBar.hidden = !busy;
        this.menus.replaceChildren(
            this.filterMenu(model, state, openMenu),
            ...this.catalogMenu(model, busy, openMenu),
        );
    }

    focusSearch(): void {
        this.input.focus();
    }

    /** Where focus goes when the list has no control: the line's first button. */
    focusStart(): void {
        this.searchToggle.focus();
    }

    private filterMenu(
        model: AddOnCatalogPayload,
        state: ViewState,
        openMenu: string | undefined,
    ): HTMLElement {
        const { kinds } = state.filter;
        const counts = catalogCounts(model).byKind;
        const items = KIND_ORDER.map((kind) => this.kindItem(kind, kinds.has(kind), counts[kind]));
        return menuAnchor(
            FILTER_MENU,
            filterLabelText(kinds.size),
            openMenu === FILTER_MENU,
            items,
            this.handlers.onMenu,
            { icon: ListFilter, marked: kinds.size > 0 },
        );
    }

    private kindItem(kind: AddOnKind, chosen: boolean, count: number): HTMLButtonElement {
        const item = markFocus(button("ds-btn ds-btn-ghost av-kind-item"), "filterKind", kind);
        item.setAttribute("role", "menuitemcheckbox");
        item.setAttribute("aria-checked", String(chosen));
        item.append(
            icon(Check, 14, "av-kind-check"),
            icon(KIND_ICON[kind], 14, "av-kind-glyph"),
            el("span", "av-kind-label", KIND_TEXT[kind].plural),
            el("span", "ds-count", String(count)),
        );
        item.addEventListener("click", () => this.handlers.onKind(kind));
        return item;
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
            if (event.key !== "Escape") return;
            event.preventDefault();
            if (this.input.value !== "") {
                this.handlers.onQuery("");
                return;
            }
            this.handlers.onSearchToggle();
            this.searchToggle.focus();
        });
        this.clear.addEventListener("click", () => {
            this.handlers.onQuery("");
            this.input.focus();
        });
        box.append(icon(Search, 16, "ds-search-icon"), this.input, this.clear);
        return box;
    }
}
