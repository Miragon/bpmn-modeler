import type { MergePaneBuild } from "@miragon/bpmn-modeler-shared";
import {
    createButton,
    createElement,
    DIFF_LEGEND_TEXTS,
    MERGE_MARKER_CLASSES,
    MERGE_SIDES,
    type MergeSide,
} from "@miragon/bpmn-modeler-types";

import type { MergeMenuRowContent } from "../../domain/mergeMenuRows";
import type { MergePadDecision } from "../../domain/mergePadDecisions";
import type { MergeStepList } from "../../domain/mergeStepper";
import {
    decisionButtonText,
    MERGE_MARKER_LABELS,
    MERGE_MENU_TEXTS,
    MERGE_STEP_TEXTS,
    reviewNotesText,
    shapelessEntryText,
    shapelessHeadingText,
    shapelessValueLines,
} from "../../domain/mergeBarTexts";
import { compareWithText, type MergeTranslate, padDecisionText } from "../../domain/mergeTexts";
import { MergeBuildButton } from "./mergeBuildButton";
import { CODE_ICON_SVG, ELEMENT_XML_CHANGES_TITLE } from "./elementXmlEntry";
import { closeMergePopupOnDismiss } from "./mergePopupDismissal";
import { installMergeTooltips, MERGE_TOOLTIP_ATTRIBUTE } from "./mergeTooltip";

export interface MergeMenuActions {
    readonly onStepList: (list: MergeStepList) => void;
    readonly onShowAll: () => void;
    /** Steps to a shape-less element from its row. */
    readonly onShapeless: (elementId: string) => void;
    readonly onDecide: (elementId: string, decision: MergePadDecision) => void;
    readonly onCompare: (against: MergeSide) => void;
    /** Opens a shape-less element's XML changes from its row, as the pad does for a drawn one. */
    readonly onXmlChanges: (elementId: string) => void;
    readonly onReviewNotes: () => void;
    readonly onBuild: () => void;
}

/** What the "…" menu shows; the host decided all of it but the step list's place. */
export interface MergeMenuState {
    /** Set while a narrow bar has moved Build into the menu. */
    readonly build?: Pick<MergePaneBuild, "canBuild" | "openConflicts">;
    readonly stepList: MergeStepList;
    readonly canStep: boolean;
    readonly rows: readonly MergeMenuRowContent[];
    /** The element the stepper is on. */
    readonly current?: string;
    readonly built: boolean;
    readonly notesCount: number;
    readonly notesOpen: boolean;
}

const STEP_LISTS: readonly { readonly list: MergeStepList; readonly label: string }[] = [
    { list: "openConflicts", label: MERGE_STEP_TEXTS.openConflictSteps },
    { list: "all", label: MERGE_STEP_TEXTS.allSteps },
];

const MOVES: Readonly<Record<string, (index: number, count: number) => number>> = {
    ArrowDown: (index, count) => (index + 1) % count,
    ArrowUp: (index, count) => (index - 1 + count) % count,
    Home: () => 0,
    End: (_index, count) => count - 1,
};

let menus = 0;

/**
 * The right pane's "…" menu, a popup below its button: Build where a narrow
 * bar moved it here, the list Next and Previous walk, Show all, the
 * shape-less elements with their decisions, the comparisons with either
 * side and the build's notes. Escape closes it and gives the focus back to
 * "…", the arrow keys, Home and End move through its enabled buttons, and a
 * click outside closes it. The rows are rebuilt only when they change; the
 * focus then stays on the same button, or moves to its row's first
 * decision, or to the next row, or the one before at the end.
 */
export class MergeMenu {
    readonly element = createElement("div", "merge-menu");
    private readonly buildSection = createElement("div", "merge-menu__section");
    private readonly build: MergeBuildButton;
    private readonly stepHeading = createElement("div", "merge-menu__heading");
    private readonly stepListGroup = createElement("div", "merge-menu__group");
    private readonly stepListButtons: ReadonlyMap<MergeStepList, HTMLButtonElement>;
    private readonly showAllButton: HTMLButtonElement;
    private readonly shapelessSection = createElement("div", "merge-menu__section");
    private readonly shapelessHeading = createElement("div", "merge-menu__heading");
    private readonly stepped = createElement("p", "merge-menu__stepped");
    private readonly rowList = createElement("ul", "merge-menu__rows");
    private readonly compareButtons: ReadonlyMap<MergeSide, HTMLButtonElement>;
    private readonly reviewButton: HTMLButtonElement;
    private readonly announcer = createElement("div", "merge-bar__visually-hidden");
    private state?: MergeMenuState;
    private listedRows?: string;
    private byStep = false;

    constructor(
        private readonly actions: MergeMenuActions,
        private readonly translate: MergeTranslate,
        private readonly opener: HTMLButtonElement,
    ) {
        menus += 1;
        installMergeTooltips(opener.ownerDocument);
        this.element.id = `merge-menu-${menus}`;
        this.element.setAttribute("role", "dialog");
        this.element.hidden = true;
        this.build = new MergeBuildButton(
            createElement("div", "merge-menu__build-wrap"),
            "merge-menu__item merge-menu__build",
            `${this.element.id}-build-blocked`,
            () => {
                if (!this.state?.build?.canBuild) return;
                this.close(false);
                actions.onBuild();
            },
        );
        this.buildSection.append(this.build.wrap, separator());
        this.stepListButtons = new Map(
            STEP_LISTS.map(({ list }) => {
                const radio = createButton("merge-menu__item", () => actions.onStepList(list));
                radio.setAttribute("role", "radio");
                return [list, radio];
            }),
        );
        this.stepListGroup.setAttribute("role", "radiogroup");
        this.stepListGroup.append(...this.stepListButtons.values());
        this.showAllButton = createButton("merge-menu__item", () => {
            this.close(true);
            actions.onShowAll();
        });
        this.stepped.hidden = true;
        this.shapelessSection.append(
            separator(),
            this.shapelessHeading,
            this.stepped,
            this.rowList,
        );
        this.compareButtons = new Map(
            MERGE_SIDES.map((side) => [
                side,
                createButton("merge-menu__item", () => {
                    if (!this.state?.built) return;
                    this.close(false);
                    actions.onCompare(side);
                }),
            ]),
        );
        this.reviewButton = createButton("merge-menu__item", () => {
            if (this.state?.notesCount) actions.onReviewNotes();
        });
        this.reviewButton.setAttribute("aria-haspopup", "dialog");
        this.announcer.setAttribute("role", "status");
        this.element.append(
            this.buildSection,
            this.stepHeading,
            this.stepListGroup,
            separator(),
            this.showAllButton,
            this.shapelessSection,
            separator(),
            ...this.compareButtons.values(),
            this.reviewButton,
            this.announcer,
        );
        this.element.addEventListener("keydown", (event) => this.onKeyDown(event));
        closeMergePopupOnDismiss(this.element, opener, (returnFocus) => this.close(returnFocus));
        this.render();
    }

    isOpen(): boolean {
        return !this.element.hidden;
    }

    /** Whether a step onto a shape-less element opened the menu, which a step elsewhere closes. */
    openedByStep(): boolean {
        return this.isOpen() && this.byStep;
    }

    update(state: MergeMenuState): void {
        this.state = state;
        this.render();
    }

    /** Opens the menu; from the keyboard or a click, the focus goes to the checked list. */
    open(focusFirst: boolean): void {
        this.show(false);
        if (focusFirst) this.stepListButtons.get(this.state?.stepList ?? "openConflicts")?.focus();
    }

    /**
     * Opens the menu for a step onto a shape-less element, with its row in
     * view and the reason shown, leaving the focus where it is, so the
     * keyboard stays on ‹ ›.
     */
    openAt(elementId: string): void {
        this.show(true);
        this.rowOf(elementId)?.scrollIntoView({ block: "nearest" });
    }

    close(returnFocus: boolean): void {
        if (!this.isOpen()) return;
        this.element.hidden = true;
        this.byStep = false;
        this.opener.setAttribute("aria-expanded", "false");
        if (returnFocus) this.opener.focus();
    }

    /** Announces what a row's decision did, once, through a live region that exists before its text. */
    announce(lines: readonly string[]): void {
        this.announcer.textContent = lines.join(". ");
    }

    /** Writes every word again, after an update or a change of language. */
    render(): void {
        const { state, translate } = this;
        this.element.setAttribute("aria-label", translate(MERGE_MENU_TEXTS.more));
        this.buildSection.hidden = state?.build === undefined;
        this.build.render(state?.build, translate);
        this.stepHeading.textContent = translate(MERGE_STEP_TEXTS.stepList);
        this.stepListGroup.setAttribute("aria-label", translate(MERGE_STEP_TEXTS.stepList));
        for (const { list, label } of STEP_LISTS) {
            const radio = this.stepListButtons.get(list);
            radio?.setAttribute(
                "aria-checked",
                String(list === (state?.stepList ?? "openConflicts")),
            );
            if (radio) radio.textContent = translate(label);
        }
        this.showAllButton.textContent = translate(DIFF_LEGEND_TEXTS.showAll);
        this.showAllButton.disabled = !state?.canStep;
        this.stepped.textContent = translate(MERGE_MENU_TEXTS.steppedHere);
        this.renderRows(state?.rows ?? [], state?.current);
        for (const [side, compareButton] of this.compareButtons) {
            compareButton.textContent = compareWithText(side, translate);
            compareButton.disabled = !state?.built;
        }
        this.reviewButton.textContent = reviewNotesText(state?.notesCount ?? 0, translate);
        this.reviewButton.disabled = !state?.notesCount;
        this.reviewButton.setAttribute("aria-expanded", String(state?.notesOpen ?? false));
    }

    private show(byStep: boolean): void {
        this.byStep = byStep;
        this.stepped.hidden = !byStep;
        this.element.hidden = false;
        this.opener.setAttribute("aria-expanded", "true");
    }

    private renderRows(rows: readonly MergeMenuRowContent[], current: string | undefined): void {
        this.shapelessSection.hidden = rows.length === 0;
        this.shapelessHeading.textContent = shapelessHeadingText(rows.length, this.translate);
        const listed = JSON.stringify(
            rows.map((row) => [
                row,
                shapelessEntryText(row, this.translate),
                shapelessValueLines(row.values, this.translate),
                row.decisions.map((decision) => padDecisionText(decision, this.translate)),
            ]),
        );
        if (listed !== this.listedRows) {
            const previousIds = this.rowItems().map((item) => item.dataset.rowFor ?? "");
            this.listedRows = listed;
            const focused = this.focusedRowButton();
            this.rowList.replaceChildren(...rows.map((row) => this.rowItem(row)));
            if (focused) this.refocus(focused, previousIds);
        }
        for (const item of this.rowItems()) {
            const stepButton = item.querySelector<HTMLElement>(".merge-menu__row-step");
            if (item.dataset.rowFor === current) stepButton?.setAttribute("aria-current", "true");
            else stepButton?.removeAttribute("aria-current");
        }
    }

    private rowItem(row: MergeMenuRowContent): HTMLLIElement {
        const { translate } = this;
        const item = createElement("li", "merge-menu__row");
        item.dataset.rowFor = row.id;
        const name = shapelessEntryText(row, translate);
        const stepButton = createButton("merge-menu__row-step", () =>
            this.actions.onShapeless(row.id),
        );
        stepButton.dataset.focusKey = "step";
        stepButton.setAttribute(
            "aria-label",
            `${name}: ${translate(MERGE_MARKER_LABELS[row.marker])}`,
        );
        stepButton.append(
            createElement(
                "span",
                `diff-legend__swatch diff-legend__swatch--${MERGE_MARKER_CLASSES[row.marker]}`,
            ),
            createElement("span", "merge-menu__row-name", name),
        );
        const lines = shapelessValueLines(row.values, translate);
        const values = createElement("div", "merge-menu__row-values");
        values.hidden = lines.length === 0;
        values.append(
            ...lines.map((segments) => {
                const line = createElement("p", "merge-menu__row-value");
                line.append(
                    ...segments.map(({ text, value }) =>
                        value ? createElement("code", "merge-menu__value", text) : text,
                    ),
                );
                return line;
            }),
        );
        const decisions = createElement("div", "merge-menu__row-picks");
        decisions.setAttribute("role", "group");
        decisions.setAttribute("aria-label", name);
        decisions.append(
            ...row.decisions.map((decision) => {
                const { label, tooltip } = padDecisionText(decision, translate);
                const decisionButton = createButton(
                    "merge-menu__mini",
                    () => this.actions.onDecide(row.id, decision),
                    decisionButtonText(decision, translate),
                );
                decisionButton.dataset.focusKey = JSON.stringify(decision);
                decisionButton.setAttribute("aria-label", label);
                decisionButton.setAttribute(MERGE_TOOLTIP_ATTRIBUTE, tooltip);
                return decisionButton;
            }),
        );
        if (row.xmlChanges) decisions.append(this.xmlChangesButton(row.id));
        const outcome = createElement("div", "merge-menu__outcome");
        outcome.hidden = row.outcome === undefined;
        outcome.append(...(row.outcome ?? []).map((line) => createElement("span", "", line)));
        item.append(stepButton, values, decisions, outcome);
        return item;
    }

    private xmlChangesButton(elementId: string): HTMLButtonElement {
        const title = this.translate(ELEMENT_XML_CHANGES_TITLE);
        const xmlButton = createButton("merge-menu__mini merge-menu__xml", () =>
            this.actions.onXmlChanges(elementId),
        );
        xmlButton.dataset.focusKey = "xml";
        xmlButton.setAttribute("aria-label", title);
        xmlButton.setAttribute(MERGE_TOOLTIP_ATTRIBUTE, title);
        xmlButton.innerHTML = CODE_ICON_SVG;
        return xmlButton;
    }

    /**
     * After a rebuild: the same button of the same row, else the row's first
     * decision, else the row now at the gone row's place, else the one before.
     */
    private refocus(
        focused: { readonly rowId: string; readonly key: string },
        previousIds: readonly string[],
    ): void {
        const row = this.rowOf(focused.rowId);
        if (row) {
            const buttons = [...row.querySelectorAll<HTMLButtonElement>("button")];
            const target =
                buttons.find((candidate) => candidate.dataset.focusKey === focused.key) ??
                row.querySelector<HTMLButtonElement>(".merge-menu__mini") ??
                buttons[0];
            target?.focus();
            return;
        }
        const items = this.rowItems();
        const place = Math.min(previousIds.indexOf(focused.rowId), items.length - 1);
        const fallback = items[place] ?? items.at(-1);
        const target =
            fallback?.querySelector<HTMLButtonElement>(".merge-menu__mini") ??
            fallback?.querySelector<HTMLButtonElement>("button") ??
            this.focusableButtons()[0];
        target?.focus();
    }

    private focusedRowButton(): { readonly rowId: string; readonly key: string } | undefined {
        const focused = this.element.ownerDocument.activeElement;
        if (!(focused instanceof HTMLElement) || !this.rowList.contains(focused)) return undefined;
        const rowId = focused.closest<HTMLElement>(".merge-menu__row")?.dataset.rowFor;
        return rowId === undefined ? undefined : { rowId, key: focused.dataset.focusKey ?? "" };
    }

    private onKeyDown(event: KeyboardEvent): void {
        const move = MOVES[event.key];
        const buttons = this.focusableButtons();
        if (!move || buttons.length === 0) return;
        event.preventDefault();
        const index = buttons.indexOf(
            this.element.ownerDocument.activeElement as HTMLButtonElement,
        );
        buttons[move(index, buttons.length)]?.focus();
    }

    private focusableButtons(): HTMLButtonElement[] {
        return [...this.element.querySelectorAll("button")].filter(
            (button) => !button.disabled && button.closest("[hidden]") === null,
        );
    }

    private rowItems(): HTMLElement[] {
        return [...this.rowList.querySelectorAll<HTMLElement>(".merge-menu__row")];
    }

    private rowOf(elementId: string): HTMLElement | undefined {
        return this.rowItems().find((item) => item.dataset.rowFor === elementId);
    }
}

function separator(): HTMLElement {
    const line = createElement("div", "merge-menu__separator");
    line.setAttribute("role", "separator");
    return line;
}
