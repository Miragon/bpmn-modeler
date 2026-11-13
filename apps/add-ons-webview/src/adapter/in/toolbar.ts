import type { AddOnCatalogPayload } from "@miragon/bpmn-modeler-shared";
import { Search, X } from "lucide";

import { AddOnKind, CatalogCounts, catalogCounts, KIND_ORDER } from "../../domain/catalogFilter";
import { CHROME_TEXT, KIND_TEXT, summaryText } from "../../domain/chromeTexts";
import { CATALOG_TARGET, isBusy, ViewState } from "../../domain/viewState";
import { actionButton, button, el, icon, markFocus, setBusy } from "./dom";
import { CATALOG_ACTION_ICON } from "./icons";
import { CATALOG_MENU, menuAnchor } from "./menu";

/** All, then each kind: a segment's place in the radio group's arrow order. */
const SEGMENTS: readonly (AddOnKind | undefined)[] = [undefined, ...KIND_ORDER];

interface Segment {
    readonly button: HTMLButtonElement;
    readonly count: HTMLElement;
}

const SEARCH_ID = "av-search";

export interface ToolbarHandlers {
    readonly onQuery: (query: string) => void;
    /** No kind: All. */
    readonly onKind: (kind: AddOnKind | undefined) => void;
    readonly onMenu: (menuId: string) => void;
    readonly onSearchToggle: () => void;
}

/**
 * One line: what needs attention, a search button and the "More actions"
 * menu; the search field opens below it, and below that one segment per kind
 * after All. The search and the segments keep their elements across renders,
 * so typing and arrowing never lose focus.
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
    private readonly segments = new Map<AddOnKind | undefined, Segment>();

    constructor(private readonly handlers: ToolbarHandlers) {
        this.searchToggle.append(icon(Search, 16));
        this.searchToggle.setAttribute("aria-controls", SEARCH_ID);
        this.searchToggle.addEventListener("click", () => handlers.onSearchToggle());
        const line = el("div", "av-toolbar-line");
        line.append(this.summary, this.searchToggle, this.menus);
        this.searchRow.append(this.searchField());
        this.searchRow.id = SEARCH_ID;
        const kinds = el("div", "av-kinds");
        kinds.setAttribute("role", "radiogroup");
        kinds.setAttribute("aria-label", CHROME_TEXT.kinds);
        SEGMENTS.forEach((kind) => {
            const segment = segmentOf(kind);
            segment.button.addEventListener("click", () => handlers.onKind(kind));
            this.segments.set(kind, segment);
            kinds.append(segment.button);
        });
        kinds.addEventListener("keydown", (event) => this.moveInKinds(event));
        const busy = el("div", "av-toolbar-busy");
        busy.append(this.busyBar);
        this.element.append(line, this.searchRow, kinds, busy);
    }

    update(
        model: AddOnCatalogPayload,
        state: ViewState,
        openMenu: string | undefined,
        searchOpen: boolean,
    ): void {
        const { filter } = state;
        const counts = catalogCounts(model, filter.kind);
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
        this.updateSegments(counts, filter.kind);
        this.menus.replaceChildren(...this.catalogMenu(model, busy, openMenu));
    }

    focusSearch(): void {
        this.input.focus();
    }

    /** Where focus goes when the list has no control: the line's first button. */
    focusStart(): void {
        this.searchToggle.focus();
    }

    /** A radio group: only the chosen segment takes Tab, the arrows choose another. */
    private updateSegments(counts: CatalogCounts, chosen: AddOnKind | undefined): void {
        this.segments.forEach((segment, kind) => {
            const checked = kind === chosen;
            const count = String(kind === undefined ? counts.total : counts.byKind[kind]);
            segment.button.setAttribute("aria-checked", String(checked));
            segment.button.tabIndex = checked ? 0 : -1;
            if (segment.count.textContent !== count) segment.count.textContent = count;
            segment.button.setAttribute("aria-label", `${segmentName(kind)}, ${count}`);
        });
    }

    private moveInKinds(event: KeyboardEvent): void {
        const index = SEGMENTS.findIndex(
            (kind) => this.segments.get(kind)?.button === event.target,
        );
        const step = KIND_STEP[event.key];
        if (index === -1 || step === undefined) return;
        event.preventDefault();
        const next = SEGMENTS[step(index, SEGMENTS.length)];
        this.handlers.onKind(next);
        this.segments.get(next)?.button.focus();
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

const KIND_STEP: Readonly<Record<string, (index: number, count: number) => number>> = {
    ArrowRight: (index, count) => (index + 1) % count,
    ArrowDown: (index, count) => (index + 1) % count,
    ArrowLeft: (index, count) => (index - 1 + count) % count,
    ArrowUp: (index, count) => (index - 1 + count) % count,
    Home: () => 0,
    End: (_, count) => count - 1,
};

function segmentName(kind: AddOnKind | undefined): string {
    return kind === undefined ? CHROME_TEXT.allKinds : KIND_TEXT[kind].plural;
}

function segmentOf(kind: AddOnKind | undefined): Segment {
    const segment = markFocus(button("av-kind"), "kindSegment", kind ?? "all");
    segment.setAttribute("role", "radio");
    segment.title = segmentName(kind);
    const label = kind === undefined ? CHROME_TEXT.allKinds : KIND_TEXT[kind].short;
    const count = el("span", "av-kind-count");
    count.setAttribute("aria-hidden", "true");
    segment.append(el("span", "av-kind-label", label), count);
    return { button: segment, count };
}
