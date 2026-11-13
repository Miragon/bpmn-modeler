import type { AddOnCatalogPayload } from "@miragon/bpmn-modeler-shared";

import { placementOf } from "../../domain/catalogQueries";
import { announcementOf, CHROME_TEXT, reviewCountText } from "../../domain/chromeTexts";
import { headsOf, isShownOpen } from "../../domain/expansion";
import { FocusTarget, isRequestedByHost } from "../../domain/focusAfter";
import { catalogPhaseOf, ListContent, listContentOf } from "../../domain/listContent";
import {
    CATALOG_TARGET,
    isBusy,
    listExpansionOf,
    selectedIdOf,
    ViewEvent,
    ViewState,
} from "../../domain/viewState";
import { backButton, detailOf, hintOf } from "./detailView";
import { el, elementAt, setBusy } from "./dom";
import { catalogEmptyOf, loadingOf, noMatchOf } from "./emptyStates";
import { FocusKeeper } from "./focusKeeper";
import { BROWSER_LAYOUT, Layout } from "./layout";
import { MENU_ITEMS } from "./menu";
import { sectionsListOf } from "./listView";
import { ResultBanner } from "./resultBanner";
import { statusBox } from "./statusMarks";
import { Toolbar } from "./toolbar";

const REVEAL_MS = 2400;

/**
 * The Add-ons view: a list of what needs attention, then what is installed by
 * folder and source, then the marketplaces, beside the detail of the selected
 * add-on, or, in a narrow view, a drill-down from one to the other. It builds its DOM with the DOM API from the state; the reducer
 * decides everything else. A part is only rebuilt when what it shows changed,
 * and focus returns to the place it held.
 */
export class AddOnsView {
    private state?: ViewState;
    private openMenu?: string;
    private searchOpen = false;
    private revealedId?: string;
    private revealTimer?: ReturnType<typeof setTimeout>;
    private listScroll = 0;
    private shownDetailId?: string;
    private listInputs: readonly unknown[] = [];
    private detailInputs: readonly unknown[] = [];

    private readonly app = el("div", "av-app");
    private readonly toolbar: Toolbar;
    private readonly banner = new ResultBanner();
    private readonly list = el("section", "av-list");
    private readonly detail = el("section", "av-detail");
    private readonly announcer = el("p", "av-vh");
    private readonly focus: FocusKeeper;

    constructor(
        private readonly root: HTMLElement,
        private readonly dispatch: (event: ViewEvent) => void,
        private readonly layout: Layout = BROWSER_LAYOUT,
    ) {
        this.toolbar = new Toolbar({
            onQuery: (query) => {
                // A field that took a query stays open once it is cleared, so focus stays in it.
                if (query !== "") this.searchOpen = true;
                dispatch({ kind: "queryChanged", query });
            },
            onKind: (addOnKind) => dispatch({ kind: "kindToggled", addOnKind }),
            onMenu: (menuId) => this.toggleMenu(menuId),
            onSearchToggle: () => this.toggleSearch(),
        });
        this.focus = new FocusKeeper(root, this.list, layout, () => this.toolbar.focusStart());
        this.list.setAttribute("aria-label", CHROME_TEXT.title);
        this.announcer.setAttribute("aria-live", "polite");
        const body = el("div", "av-body");
        body.append(this.list, this.detail);
        this.app.append(this.toolbar.element, this.banner.element, body, this.announcer);
        const frame = el("main", "av-frame");
        frame.setAttribute("aria-label", CHROME_TEXT.title);
        frame.append(this.app);
        root.replaceChildren(frame);
        // A narrow view's toolbar sticks over the page; Tab must not focus a row beneath it.
        layout.watchHeight(this.toolbar.element, (height) =>
            document.documentElement.style.setProperty("--av-sticky-top", `${height}px`),
        );
        root.addEventListener("click", (event) => this.clicked(event));
        root.addEventListener("keydown", (event) => this.closeMenuOnKey(event));
    }

    render(state: ViewState, target?: FocusTarget): void {
        const reveal =
            target?.kind === "head" && target.reveal === true ? target.headId : undefined;
        if (isRequestedByHost(target)) this.openMenu = undefined;
        if (reveal !== undefined) this.startReveal(reveal);
        this.show(state, target);
        if (reveal !== undefined) this.finishReveal(reveal);
    }

    /** The host focused the view: focus goes to the selected add-on, else to the toolbar. */
    focusFromOutside(): void {
        const state = this.state;
        if (state === undefined || this.root.contains(document.activeElement)) return;
        const selected = selectedIdOf(state);
        if (selected !== undefined && this.focus.addOn(selected)) return;
        if (catalogPhaseOf(state.model) === "ready") this.toolbar.focusStart();
    }

    /**
     * A focus target only moves focus the view holds, or that fell to the page
     * with a removed control; one a host requested also moves it from the search.
     */
    private show(state: ViewState, target?: FocusTarget): void {
        const held = this.focus.held();
        const owned =
            held !== undefined ||
            document.activeElement === document.body ||
            (isRequestedByHost(target) && this.root.contains(document.activeElement));
        this.state = state;
        this.draw(state);
        const revealing = target?.kind === "head" && target.reveal === true;
        if (target !== undefined && !revealing) {
            if (owned) this.focus.apply(target);
        } else if (held !== undefined) {
            this.focus.recover(held, selectedIdOf(state));
        }
    }

    private redraw(): void {
        if (this.state !== undefined) this.show(this.state);
    }

    private draw(state: ViewState): void {
        const { model } = state;
        const phase = catalogPhaseOf(model);
        this.app.dataset.phase = phase;
        this.app.dataset.pane = state.pane;
        setBusy(this.list, model === undefined);
        this.banner.show(state.banner);
        if (model === undefined) {
            this.list.replaceChildren(loadingOf());
            return;
        }
        this.toolbar.update(model, state, this.openMenu, this.searchOpen);
        const content = listContentOf(model, state.filter);
        this.drawList(content, model, state);
        this.drawDetail(model, state);
        this.announce(content, state);
    }

    private drawList(content: ListContent, model: AddOnCatalogPayload, state: ViewState): void {
        const selectedId = selectedIdOf(state);
        const inputs = [
            model,
            state.filter,
            state.expansion,
            state.filterExpansion,
            state.pending,
            selectedId,
            this.revealedId,
            this.openMenu,
        ];
        if (sameInputs(inputs, this.listInputs)) return;
        this.listInputs = inputs;
        const parts: HTMLElement[] = [];
        if (model.problem !== undefined) {
            parts.push(statusBox("danger", model.problem, "av-catalog-problem"));
        }
        parts.push(...this.contentOf(content, model, state));
        this.list.replaceChildren(...parts);
    }

    private contentOf(
        content: ListContent,
        model: AddOnCatalogPayload,
        state: ViewState,
    ): HTMLElement[] {
        const busy = isBusy(state, CATALOG_TARGET);
        switch (content.kind) {
            case "catalogEmpty":
                return catalogEmptyOf(content.text, content.buttons, busy);
            case "noMatch":
                return [noMatchOf(CHROME_TEXT.noMatch, () => this.clearFilters())];
            case "sections": {
                const heads = new Map(headsOf(model).map((head) => [head.id, head]));
                const shown = listExpansionOf(state);
                return sectionsListOf(content.sections, content.installedText, {
                    state,
                    isOpen: (id) => {
                        const head = heads.get(id);
                        return head !== undefined && isShownOpen(head, shown);
                    },
                    selectedId: selectedIdOf(state),
                    revealedId: this.revealedId,
                    openMenu: this.openMenu,
                    onSelect: (addOnId) => this.select(addOnId),
                    onMenu: (menuId) => this.toggleMenu(menuId),
                });
            }
        }
    }

    private drawDetail(model: AddOnCatalogPayload, state: ViewState): void {
        const selectedId = selectedIdOf(state);
        const placement =
            selectedId === undefined ? undefined : placementOf(model.groups, selectedId);
        const inputs = [
            placement?.addOn,
            placement?.source,
            placement?.group,
            state.expansion,
            state.pending,
            this.revealedId,
        ];
        if (sameInputs(inputs, this.detailInputs)) return;
        this.detailInputs = inputs;
        const back = backButton(() => this.back());
        this.detail.replaceChildren(
            back,
            placement === undefined
                ? hintOf()
                : detailOf(placement, state, placement.addOn.id === this.revealedId),
        );
        if (this.shownDetailId !== selectedId) {
            this.detail.scrollTop = 0;
            this.shownDetailId = selectedId;
        }
    }

    private announce(content: ListContent, state: ViewState): void {
        const text =
            state.reviewCount === undefined
                ? announcementOf(content, state.filter)
                : reviewCountText(state.reviewCount);
        if (this.announcer.textContent !== text) this.announcer.textContent = text;
    }

    // --- The user's choices ---

    private clicked(event: MouseEvent): void {
        const target = event.target as Element;
        const menuWasOpen = this.openMenu !== undefined;
        const action = target.closest<HTMLElement>("[data-action-kind]");
        // A chosen item closes its menu, and so does any click beside it.
        if (target.closest(".av-menu-anchor") === null || action !== null)
            this.openMenu = undefined;
        const viewEvent = this.eventOf(target, action);
        if (viewEvent !== undefined) this.dispatch(viewEvent);
        else if (menuWasOpen && this.openMenu === undefined) this.redraw();
    }

    private eventOf(target: Element, action: HTMLElement | null): ViewEvent | undefined {
        if (action !== null) {
            if (action.getAttribute("aria-disabled") === "true") return undefined;
            return {
                kind: "actionChosen",
                actionKind: action.dataset.actionKind ?? "",
                ...(action.dataset.targetId !== undefined && { targetId: action.dataset.targetId }),
            };
        }
        const key = target.closest<HTMLElement>("[data-toggle]")?.dataset.toggle;
        if (key !== undefined) return { kind: "toggled", key };
        if (target.closest("[data-dismiss-banner]") !== null) return { kind: "bannerDismissed" };
        return undefined;
    }

    private select(addOnId: string): void {
        if (this.layout.isShown(this.list)) this.listScroll = this.layout.pageScrollTop();
        this.dispatch({ kind: "addOnSelected", addOnId });
        // A drill-down: the detail took the list's place.
        if (!this.layout.isShown(this.list)) {
            this.layout.scrollPageTo(0);
            this.focus.first([{ kind: "name", id: addOnId }]);
        }
    }

    private back(): void {
        this.dispatch({ kind: "backChosen" });
        this.layout.scrollPageTo(this.listScroll);
        const selected = this.state && selectedIdOf(this.state);
        if (selected === undefined || !this.focus.first([{ kind: "row", id: selected }])) {
            this.focus.listStart();
        }
    }

    /** Opening the search focuses its field; closing it leaves the query as it was. */
    private toggleSearch(): void {
        this.searchOpen = !this.searchOpen;
        this.redraw();
        if (this.searchOpen) this.toolbar.focusSearch();
    }

    private clearFilters(): void {
        this.searchOpen = false;
        this.dispatch({ kind: "filtersCleared" });
        this.focus.listStart();
    }

    private toggleMenu(menuId: string): void {
        this.openMenu = this.openMenu === menuId ? undefined : menuId;
        this.redraw();
        if (this.openMenu !== undefined) {
            this.root.querySelector<HTMLElement>(`.av-menu ${MENU_ITEMS}`)?.focus();
        }
    }

    /** Escape closes a menu; Tab too, from its button, so the browser's Tab moves on from there. */
    private closeMenuOnKey(event: KeyboardEvent): void {
        if (this.openMenu === undefined) return;
        const leaves = event.key === "Tab" && (event.target as Element).closest("[role=menu]");
        if (event.key !== "Escape" && !leaves) return;
        const menuId = this.openMenu;
        this.openMenu = undefined;
        this.redraw();
        this.focus.first([{ kind: "menu", id: menuId }]);
    }

    // --- Focus and reveal ---

    /** A host "Review…": the reducer selected the add-on and opened its review; the view rings it. */
    private startReveal(addOnId: string): void {
        this.revealedId = addOnId;
        clearTimeout(this.revealTimer);
        this.revealTimer = setTimeout(() => this.endReveal(), REVEAL_MS);
    }

    /** Focus only follows a reveal into a page that has it; the host's focus then lands here. */
    private finishReveal(addOnId: string): void {
        if (!document.hasFocus()) return;
        const row = elementAt(this.root, { kind: "row", id: addOnId });
        if (row !== null && this.layout.isShown(row)) {
            this.layout.scrollIntoView(row);
            row.focus({ preventScroll: true });
            return;
        }
        this.layout.scrollPageTo(0);
        this.focus.first([{ kind: "name", id: addOnId }]);
    }

    private endReveal(): void {
        this.revealedId = undefined;
        this.root
            .querySelectorAll(".av-revealed")
            .forEach((each) => each.classList.remove("av-revealed"));
    }
}

function sameInputs(next: readonly unknown[], previous: readonly unknown[]): boolean {
    return next.length === previous.length && next.every((each, index) => each === previous[index]);
}
