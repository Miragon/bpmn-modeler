import type {
    ActionViewPayload,
    AddOnCatalogPayload,
    AddOnGroupPayload,
    AddOnPayload,
    AddOnReviewPayload,
    AddOnSourcePayload,
} from "@miragon/bpmn-modeler-shared";

import { CHROME_TEXT } from "../../domain/chromeTexts";
import type { FocusTarget } from "../../domain/focusAfter";
import {
    Expansion,
    isOpen,
    isReviewOpen,
    OutlineHead,
    outlineHeadsOf,
    reviewKeyOf,
} from "../../domain/outline";
import { placedActions } from "../../domain/placedActions";
import type { Banner } from "../../domain/resultBanner";
import { CATALOG_TARGET, isBusy, ViewEvent, ViewState } from "../../domain/viewState";

/** Where focus was before a render, so it lands on the same place in the new elements. */
type FocusPlace =
    | { readonly kind: "head"; readonly headId: string }
    | { readonly kind: "control"; readonly headId: string; readonly index: number }
    | { readonly kind: "toolbar"; readonly actionKind: string }
    | { readonly kind: "elsewhere" };

interface BuiltRow {
    readonly digest: string;
    readonly element: HTMLLIElement;
    readonly rowActions: HTMLButtonElement[];
    readonly controls: HTMLButtonElement[];
    readonly reviewToggle?: HTMLButtonElement;
}

interface BuiltGroup {
    readonly digest: string;
    readonly section: HTMLElement;
    readonly header: HTMLButtonElement;
    readonly body: HTMLElement;
}

interface BuiltSource {
    readonly digest: string;
    readonly container: HTMLElement;
    readonly header: HTMLButtonElement;
    readonly buttons: HTMLButtonElement[];
    readonly list: HTMLUListElement;
}

/** Last build's parts by id, and this build's as it goes. */
interface Built {
    readonly groups: Map<string, BuiltGroup>;
    readonly sources: Map<string, BuiltSource>;
    readonly rows: Map<string, BuiltRow>;
}

interface BannerParts {
    readonly box: HTMLElement;
    readonly live: HTMLElement;
    readonly dismiss: HTMLButtonElement;
}

/**
 * Builds the view from the state with the DOM API only: names and paths are
 * workspace text. Parts whose view did not change keep their element in
 * place, so a screen reader does not read them again; focus returns to the
 * same place.
 */
export class CatalogView {
    private readonly toolbar: HTMLElement;
    private readonly status: BannerParts;
    private readonly alert: BannerParts;
    private readonly problem: HTMLParagraphElement;
    private readonly empty: HTMLParagraphElement;
    private readonly outline: HTMLElement;
    private heads = new Map<string, HTMLElement>();
    private controls = new Map<string, HTMLButtonElement[]>();
    private rowActions = new Map<string, HTMLButtonElement[]>();
    private reviewToggles = new Map<string, HTMLButtonElement>();
    private toolbarButtons: HTMLButtonElement[] = [];
    private built: Built = { groups: new Map(), sources: new Map(), rows: new Map() };
    private outlineHeads = new Map<string, OutlineHead>();
    private toolbarIndex = 0;
    private activeHead?: string;
    private shown?: {
        readonly model?: AddOnCatalogPayload;
        readonly expansion: Expansion;
        readonly pending: ViewState["pending"];
    };
    private nextId = 0;

    constructor(
        private readonly root: HTMLElement,
        private readonly dispatch: (event: ViewEvent) => void,
    ) {
        this.toolbar = element("div", { class: "toolbar", role: "toolbar" });
        this.toolbar.setAttribute("aria-label", CHROME_TEXT.toolbar);
        this.status = this.banner("status");
        this.alert = this.banner("alert");
        this.problem = element("p", { class: "problem catalog-problem" });
        this.empty = element("p", { class: "empty" });
        // Hidden, yet still read as the outline's description.
        const hint = element("p", { id: this.idOf("hint") });
        hint.textContent = CHROME_TEXT.hint;
        hint.hidden = true;
        // A generic div may carry no name or description.
        this.outline = element("div", { class: "outline", role: "group" });
        this.outline.setAttribute("aria-label", CHROME_TEXT.outline);
        this.outline.setAttribute("aria-describedby", hint.id);
        root.replaceChildren(
            this.toolbar,
            this.status.box,
            this.alert.box,
            this.problem,
            this.empty,
            hint,
            this.outline,
        );
        root.addEventListener("click", (event) => this.clicked(event));
        root.addEventListener("focusin", (event) => this.focused(event));
    }

    render(state: ViewState, focus?: FocusTarget): void {
        const hadFocus = this.root.contains(document.activeElement);
        const place = hadFocus ? this.placeOf(document.activeElement) : undefined;
        const { model, expansion, pending } = state;
        const shown = this.shown;
        if (
            shown === undefined ||
            shown.model !== model ||
            shown.expansion !== expansion ||
            shown.pending !== pending
        ) {
            this.build(state);
            this.shown = { model, expansion, pending };
        }
        this.showBanner(state.banner);
        this.activeHead = state.activeHead;
        this.applyTabStops();
        if (place !== undefined && !this.root.contains(document.activeElement)) {
            this.elementAt(place)?.focus();
        }
        const revealing = focus?.kind === "head" && focus.reveal === true && document.hasFocus();
        if (focus !== undefined && (hadFocus || revealing)) {
            const target = this.elementOf(focus);
            target?.focus();
            if (revealing) target?.scrollIntoView?.({ block: "nearest" });
        }
    }

    focusHead(id: string): void {
        this.heads.get(id)?.focus();
    }

    focusFirstControl(headId: string): void {
        this.controls.get(headId)?.[0]?.focus();
    }

    /** The host focused the view, as `<view>.focus` does; focus goes to the active head. */
    focusActiveHeadFromOutside(): void {
        if (this.root.contains(document.activeElement)) return;
        if (this.activeHead !== undefined) this.focusHead(this.activeHead);
    }

    private build(state: ViewState): void {
        this.heads = new Map();
        this.controls = new Map();
        this.rowActions = new Map();
        this.reviewToggles = new Map();
        const { model } = state;
        this.buildToolbar(model, isBusy(state, CATALOG_TARGET));
        showText(this.problem, model?.problem);
        showText(this.empty, model?.emptyText);
        this.outline.setAttribute("aria-busy", String(model === undefined));
        if (model === undefined) {
            const loading = element("p", { class: "loading" });
            loading.textContent = CHROME_TEXT.loading;
            this.outline.replaceChildren(loading);
            return;
        }
        this.outlineHeads = new Map(outlineHeadsOf(model).map((head) => [head.id, head]));
        const kept: Built = { groups: new Map(), sources: new Map(), rows: new Map() };
        placeChildren(
            this.outline,
            model.groups.map((group) => this.groupOf(group, state, kept)),
        );
        this.built = kept;
    }

    private buildToolbar(model: AddOnCatalogPayload | undefined, busy: boolean): void {
        this.toolbarButtons = (model?.actions ?? []).map((action) => {
            const button = actionButton(action);
            if (busy) button.setAttribute("aria-disabled", "true");
            return button;
        });
        this.toolbar.replaceChildren(...this.toolbarButtons);
    }

    private groupOf(group: AddOnGroupPayload, state: ViewState, kept: Built): HTMLElement {
        const open = this.isHeadOpen(group.id, state.expansion);
        const digest = JSON.stringify([group.label, group.description, group.problem, open]);
        const cached = this.built.groups.get(group.id);
        const built =
            cached?.digest === digest ? cached : this.builtGroup(group, open, digest, cached);
        kept.groups.set(group.id, built);
        this.heads.set(group.id, built.header);
        built.body.hidden = !open;
        placeChildren(
            built.body,
            group.sources.map((source) => this.sourceOf(source, state, kept)),
        );
        return built.section;
    }

    private builtGroup(
        group: AddOnGroupPayload,
        open: boolean,
        digest: string,
        previous: BuiltGroup | undefined,
    ): BuiltGroup {
        const section = previous?.section ?? element("section", { class: "group" });
        const body =
            previous?.body ?? element("div", { class: "group-body", id: this.idOf("body") });
        const description = paragraph("description", group.description, this.idOf("desc"));
        const header = this.headerButton(group.id, group.label, open, body.id, description.id);
        section.setAttribute("aria-labelledby", header.id);
        placeChildren(section, [
            wrapped("h2", header),
            description,
            ...optionalParagraph("problem", group.problem),
            body,
        ]);
        return { digest, section, header, body };
    }

    private sourceOf(source: AddOnSourcePayload, state: ViewState, kept: Built): HTMLElement {
        const open = this.isHeadOpen(source.id, state.expansion);
        const busy = isBusy(state, source.id);
        const digest = JSON.stringify([
            source.label,
            source.description,
            source.stateText,
            source.actions,
            source.problem,
            open,
            busy,
        ]);
        const cached = this.built.sources.get(source.id);
        const built =
            cached?.digest === digest
                ? cached
                : this.builtSource(source, open, busy, digest, cached);
        kept.sources.set(source.id, built);
        this.heads.set(source.id, built.header);
        this.controls.set(source.id, built.buttons);
        this.rowActions.set(source.id, built.buttons);
        built.list.hidden = !open;
        placeChildren(
            built.list,
            source.addOns.map((addOn) => this.rowOf(addOn, state, kept)),
        );
        return built.container;
    }

    private builtSource(
        source: AddOnSourcePayload,
        open: boolean,
        busy: boolean,
        digest: string,
        previous: BuiltSource | undefined,
    ): BuiltSource {
        const container = previous?.container ?? element("div", { class: "source" });
        container.dataset.source = source.id;
        const list = previous?.list ?? element("ul", { class: "addons", id: this.idOf("body") });
        const description = paragraph("description", source.description, this.idOf("desc"));
        const header = this.headerButton(source.id, source.label, open, list.id, description.id);
        const buttons = source.actions.map((action) =>
            this.controlButton(action, source.id, header.id, busy),
        );
        const line = element("div", { class: "source-line" });
        line.replaceChildren(
            wrapped("h3", header),
            description,
            ...(source.stateText === undefined ? [] : [badge(source.stateText)]),
            actionsOf(buttons),
        );
        if (busy) container.setAttribute("aria-busy", "true");
        else container.removeAttribute("aria-busy");
        placeChildren(container, [line, ...optionalParagraph("problem", source.problem), list]);
        return { digest, container, header, buttons, list };
    }

    private isHeadOpen(id: string, expansion: Expansion): boolean {
        const head = this.outlineHeads.get(id);
        return head !== undefined && isOpen(head, expansion);
    }

    private headerButton(
        headId: string,
        label: string,
        open: boolean,
        controlsId: string,
        descriptionId: string,
    ): HTMLButtonElement {
        const button = element("button", { class: "head", id: this.idOf("head") });
        button.type = "button";
        button.textContent = label;
        button.dataset.head = headId;
        button.dataset.toggle = headId;
        button.setAttribute("aria-expanded", String(open));
        button.setAttribute("aria-controls", controlsId);
        button.setAttribute("aria-describedby", descriptionId);
        return button;
    }

    private rowOf(addOn: AddOnPayload, state: ViewState, kept: Built): HTMLLIElement {
        const busy = isBusy(state, addOn.id);
        const reviewOpen = isReviewOpen(addOn.id, state.expansion);
        const digest = JSON.stringify([addOn, busy, reviewOpen]);
        const cached = this.built.rows.get(addOn.id);
        const built =
            cached?.digest === digest ? cached : this.builtRow(addOn, busy, reviewOpen, digest);
        kept.rows.set(addOn.id, built);
        this.heads.set(addOn.id, built.element);
        this.controls.set(addOn.id, built.controls);
        this.rowActions.set(addOn.id, built.rowActions);
        if (built.reviewToggle !== undefined) this.reviewToggles.set(addOn.id, built.reviewToggle);
        return built.element;
    }

    private builtRow(
        addOn: AddOnPayload,
        busy: boolean,
        reviewOpen: boolean,
        digest: string,
    ): BuiltRow {
        const row = element("li", { class: "addon" });
        row.dataset.head = addOn.id;
        row.dataset.state = addOn.state;
        const name = element("span", { class: "name", id: this.idOf("name") });
        name.textContent = addOn.name;
        const meta = element("span", { class: "meta", id: this.idOf("meta") });
        meta.replaceChildren(
            ...[
                addOn.kindText,
                addOn.detail,
                "engineText" in addOn ? addOn.engineText : undefined,
                addOn.stateText,
            ]
                .filter((text): text is string => text !== undefined)
                .map((text) => {
                    const part = element("span", { class: "meta-part" });
                    part.textContent = text;
                    return part;
                }),
        );
        const problem = optionalParagraph("problem", addOn.problem, this.idOf("problem"));
        const note = optionalParagraph("note", addOn.note, this.idOf("note"));
        row.setAttribute("aria-labelledby", name.id);
        row.setAttribute(
            "aria-describedby",
            [meta, ...problem, ...note].map(({ id }) => id).join(" "),
        );
        const placed = placedActions(addOn);
        const rowActions = placed.rowLine.map((action) =>
            this.controlButton(action, addOn.id, name.id, busy),
        );
        const line = element("div", { class: "row-line" });
        line.replaceChildren(name, meta, actionsOf(rowActions));
        const review =
            "review" in addOn && addOn.review !== undefined
                ? this.reviewOf(addOn.id, addOn.review, placed.allow, name.id, busy, reviewOpen)
                : undefined;
        if (busy) row.setAttribute("aria-busy", "true");
        row.replaceChildren(line, ...problem, ...note, ...(review ? [review.box] : []));
        return {
            digest,
            element: row,
            rowActions,
            controls: [...rowActions, ...(review?.controls ?? [])],
            ...(review && { reviewToggle: review.controls[0] }),
        };
    }

    private reviewOf(
        addOnId: string,
        review: AddOnReviewPayload,
        allow: ActionViewPayload<string> | undefined,
        nameId: string,
        busy: boolean,
        open: boolean,
    ): { box: HTMLElement; controls: HTMLButtonElement[] } {
        const box = element("div", { class: "review" });
        const body = element("div", { class: "review-body", id: this.idOf("review") });
        const toggle = element("button", { class: "review-toggle" });
        toggle.type = "button";
        toggle.textContent = review.heading;
        toggle.dataset.toggle = reviewKeyOf(addOnId);
        toggle.dataset.controlsOf = addOnId;
        toggle.setAttribute("aria-expanded", String(open));
        toggle.setAttribute("aria-controls", body.id);
        const warning = paragraph("warning", review.warning);
        warning.setAttribute("role", "note");
        const facts = element("dl", { class: "facts" });
        facts.replaceChildren(
            ...review.facts.flatMap(({ label, value }) => {
                const term = element("dt", {});
                term.textContent = label;
                const detail = element("dd", {});
                detail.textContent = value;
                return [term, detail];
            }),
        );
        const allowButton =
            allow === undefined
                ? undefined
                : this.controlButton(allow, addOnId, nameId, busy, "primary");
        body.hidden = !open;
        body.replaceChildren(warning, facts, ...(allowButton ? [allowButton] : []));
        box.replaceChildren(toggle, body);
        return { box, controls: [toggle, ...(allowButton ? [allowButton] : [])] };
    }

    private controlButton(
        action: ActionViewPayload<string>,
        targetId: string,
        describedBy: string,
        busy: boolean,
        className = "",
    ): HTMLButtonElement {
        const button = actionButton(action, targetId);
        if (className) button.classList.add(className);
        button.dataset.controlsOf = targetId;
        button.setAttribute("aria-describedby", describedBy);
        // Not `disabled`, so focus stays on it while the request runs.
        if (busy) button.setAttribute("aria-disabled", "true");
        return button;
    }

    private banner(tone: Banner["tone"]): BannerParts {
        const box = element("div", { class: `banner banner-${tone} is-empty` });
        const live = element("div", { class: "banner-text", role: tone });
        if (tone === "status") live.setAttribute("aria-live", "polite");
        const dismiss = element("button", { class: "banner-dismiss" });
        dismiss.type = "button";
        dismiss.textContent = CHROME_TEXT.dismiss;
        dismiss.hidden = true;
        box.replaceChildren(live, dismiss);
        return { box, live, dismiss };
    }

    private showBanner(banner: Banner | undefined): void {
        for (const [tone, parts] of [
            ["status", this.status],
            ["alert", this.alert],
        ] as const) {
            const text = banner?.tone === tone ? banner.text : "";
            if (parts.live.textContent !== text) parts.live.textContent = text;
            parts.dismiss.hidden = text === "";
            parts.box.classList.toggle("is-empty", text === "");
        }
    }

    /** One tab stop in the outline: the active head and its own controls. */
    private applyTabStops(): void {
        this.heads.forEach((head, id) => (head.tabIndex = id === this.activeHead ? 0 : -1));
        this.controls.forEach((buttons, id) =>
            buttons.forEach((button) => (button.tabIndex = id === this.activeHead ? 0 : -1)),
        );
        this.toolbarIndex = Math.min(
            this.toolbarIndex,
            Math.max(this.toolbarButtons.length - 1, 0),
        );
        this.toolbarButtons.forEach(
            (button, index) => (button.tabIndex = index === this.toolbarIndex ? 0 : -1),
        );
    }

    private clicked(event: Event): void {
        const target = event.target as Element;
        const action = target.closest<HTMLElement>("[data-action-kind]");
        if (action !== null) {
            if (action.getAttribute("aria-disabled") === "true") return;
            this.dispatch({
                kind: "actionChosen",
                actionKind: action.dataset.actionKind ?? "",
                ...(action.dataset.targetId !== undefined && { targetId: action.dataset.targetId }),
            });
            return;
        }
        const toggle = target.closest<HTMLElement>("[data-toggle]");
        if (toggle?.dataset.toggle !== undefined) {
            this.dispatch({ kind: "toggled", key: toggle.dataset.toggle });
            return;
        }
        if (target.closest(".banner-dismiss") !== null) this.dispatch({ kind: "bannerDismissed" });
    }

    private focused(event: FocusEvent): void {
        const target = event.target as HTMLElement;
        const toolbarIndex = this.toolbarButtons.indexOf(target as HTMLButtonElement);
        if (toolbarIndex !== -1) {
            this.toolbarIndex = toolbarIndex;
            this.applyTabStops();
            return;
        }
        const headId = target.dataset.head ?? target.dataset.controlsOf;
        if (headId !== undefined) this.dispatch({ kind: "headActivated", headId });
    }

    private placeOf(focused: Element | null): FocusPlace {
        if (!(focused instanceof HTMLElement)) return { kind: "elsewhere" };
        const { head, controlsOf } = focused.dataset;
        if (head !== undefined) return { kind: "head", headId: head };
        if (controlsOf !== undefined) {
            const index =
                this.controls.get(controlsOf)?.indexOf(focused as HTMLButtonElement) ?? -1;
            return { kind: "control", headId: controlsOf, index };
        }
        const toolbar = this.toolbarButtons.indexOf(focused as HTMLButtonElement);
        if (toolbar !== -1)
            return { kind: "toolbar", actionKind: focused.dataset.actionKind ?? "" };
        return { kind: "elsewhere" };
    }

    private elementAt(place: FocusPlace): HTMLElement | undefined {
        const active = this.activeHead === undefined ? undefined : this.heads.get(this.activeHead);
        switch (place.kind) {
            case "head":
                return this.heads.get(place.headId) ?? active;
            case "control":
                return (
                    this.controls.get(place.headId)?.[place.index] ??
                    this.heads.get(place.headId) ??
                    active
                );
            case "toolbar":
                return (
                    this.toolbarButtons.find(
                        (each) => each.dataset.actionKind === place.actionKind,
                    ) ?? this.toolbarButtons[0]
                );
            case "elsewhere":
                return active;
        }
    }

    private elementOf(target: FocusTarget): HTMLElement | undefined {
        switch (target.kind) {
            case "head":
                return this.heads.get(target.headId);
            case "review":
                return this.reviewToggles.get(target.addOnId);
            case "action":
                return this.rowActions.get(target.targetId)?.[target.slot];
            case "toolbar":
                return this.toolbarButtons.find(
                    (each) => each.dataset.actionKind === target.actionKind,
                );
        }
    }

    private idOf(part: string): string {
        return `ao-${part}-${++this.nextId}`;
    }
}

function element<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attributes: { readonly class?: string; readonly id?: string; readonly role?: string },
): HTMLElementTagNameMap[K] {
    const created = document.createElement(tag);
    if (attributes.class) created.className = attributes.class;
    if (attributes.id) created.id = attributes.id;
    if (attributes.role) created.setAttribute("role", attributes.role);
    return created;
}

function actionButton(action: ActionViewPayload<string>, targetId?: string): HTMLButtonElement {
    const button = element("button", { class: "action" });
    button.type = "button";
    button.textContent = action.label;
    button.dataset.actionKind = action.kind;
    if (targetId !== undefined) button.dataset.targetId = targetId;
    return button;
}

function actionsOf(buttons: readonly HTMLButtonElement[]): HTMLElement {
    const actions = element("span", { class: "actions" });
    actions.replaceChildren(...buttons);
    return actions;
}

function wrapped(tag: "h2" | "h3", child: HTMLElement): HTMLElement {
    const heading = element(tag, { class: "head-line" });
    heading.replaceChildren(child);
    return heading;
}

function paragraph(className: string, text: string, id?: string): HTMLParagraphElement {
    const created = element("p", { class: className, ...(id && { id }) });
    created.textContent = text;
    return created;
}

function optionalParagraph(
    className: string,
    text: string | undefined,
    id?: string,
): HTMLParagraphElement[] {
    return text === undefined ? [] : [paragraph(className, text, id)];
}

function badge(text: string): HTMLElement {
    const created = element("span", { class: "badge" });
    created.textContent = text;
    return created;
}

/** Moves only what changed place, as a node moved loses focus and is read again. */
function placeChildren(parent: HTMLElement, wanted: readonly HTMLElement[]): void {
    const keep = new Set<Element>(wanted);
    [...parent.children].forEach((child) => {
        if (!keep.has(child)) child.remove();
    });
    wanted.forEach((child, index) => {
        const current = parent.children[index];
        if (current !== child) parent.insertBefore(child, current ?? null);
    });
}

function showText(target: HTMLElement, text: string | undefined): void {
    target.textContent = text ?? "";
    target.hidden = text === undefined;
}
