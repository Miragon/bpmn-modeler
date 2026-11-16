import type { MergePickScope } from "@miragon/bpmn-modeler-shared";
import {
    createButton,
    createElement,
    DIFF_LEGEND_TEXTS,
    MERGE_MARKER_CLASSES,
    MERGE_SIDES,
    type MergeSide,
} from "@miragon/bpmn-modeler-types";

import type { MergeShapelessRow } from "../../domain/mergeShapelessRows";
import type { MergeStepList } from "../../domain/mergeStepper";
import {
    compareWithText,
    keepSideText,
    MERGE_LEGEND_TEXTS,
    MERGE_MARKER_LABELS,
    MERGE_MENU_TEXTS,
    MERGE_PICK_TEXTS,
    type MergeTranslate,
    reviewNotesText,
    shapelessEntryText,
    shapelessHeadingText,
} from "../../domain/mergeTexts";
import { setMergeTooltip } from "./mergeTooltip";

export interface MergeMenuActions {
    readonly onStepList: (list: MergeStepList) => void;
    readonly onShowAll: () => void;
    /** Steps to a shape-less element from its row. */
    readonly onShapeless: (elementId: string) => void;
    readonly onPick: (elementId: string, scope: MergePickScope, side: MergeSide) => void;
    readonly onUnpick: (elementId: string, scope: MergePickScope) => void;
    readonly onCompare: (against: MergeSide) => void;
    readonly onReviewNotes: () => void;
}

/** What the "…" menu shows; the host decided all of it but the step list's place. */
export interface MergeMenuState {
    readonly stepList: MergeStepList;
    readonly canStep: boolean;
    readonly rows: readonly MergeShapelessRow[];
    /** The element the stepper is on. */
    readonly current?: string;
    readonly built: boolean;
    readonly notesCount: number;
    readonly notesOpen: boolean;
}

const STEP_LISTS: readonly { readonly list: MergeStepList; readonly label: string }[] = [
    { list: "openConflicts", label: MERGE_LEGEND_TEXTS.openConflictSteps },
    { list: "all", label: MERGE_LEGEND_TEXTS.allSteps },
];

let menus = 0;

/**
 * The right pane's "…" menu, a popup below its button: which list Next and
 * Previous walk, Show all, the marked elements no canvas draws with their
 * picks, the comparisons with either side and the build's notes. Escape
 * closes it, the arrow keys move through its buttons, a click outside closes
 * it. A shape-less row is rebuilt only when the listed rows change, so a
 * pick leaves the focus on the row's buttons.
 */
export class MergeMenu {
    readonly element = createElement("div", "merge-menu");
    private readonly stepHeading = createElement("div", "merge-menu__heading");
    private readonly stepListGroup = createElement("div", "merge-menu__group");
    private readonly stepListButtons: ReadonlyMap<MergeStepList, HTMLButtonElement>;
    private readonly showAllButton: HTMLButtonElement;
    private readonly shapelessSection = createElement("div", "merge-menu__section");
    private readonly shapelessHeading = createElement("div", "merge-menu__heading");
    private readonly shapelessHeadingText = createElement("span", "");
    private readonly infoButton: HTMLButtonElement;
    private readonly shapelessList = createElement("ul", "merge-menu__rows");
    private readonly compareButtons: ReadonlyMap<MergeSide, HTMLButtonElement>;
    private readonly reviewButton: HTMLButtonElement;
    private readonly rowOutcomes = new Map<string, string>();
    private state?: MergeMenuState;
    private listedRows?: string;

    constructor(
        private readonly actions: MergeMenuActions,
        private readonly translate: MergeTranslate,
        private readonly opener: HTMLButtonElement,
    ) {
        menus += 1;
        this.element.id = `merge-menu-${menus}`;
        this.element.setAttribute("role", "dialog");
        this.element.hidden = true;
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
        this.infoButton = createButton("merge-menu__info", () => undefined, "i");
        this.shapelessHeading.append(this.shapelessHeadingText, this.infoButton);
        this.shapelessSection.append(separator(), this.shapelessHeading, this.shapelessList);
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
        this.element.append(
            this.stepHeading,
            this.stepListGroup,
            separator(),
            this.showAllButton,
            this.shapelessSection,
            separator(),
            ...this.compareButtons.values(),
            this.reviewButton,
        );
        this.element.addEventListener("keydown", (event) => this.onKeyDown(event));
        this.opener.ownerDocument.addEventListener("pointerdown", (event) => {
            const target = event.target as Node | null;
            if (this.isOpen() && !this.element.contains(target) && !this.opener.contains(target)) {
                this.close(false);
            }
        });
    }

    isOpen(): boolean {
        return !this.element.hidden;
    }

    update(state: MergeMenuState): void {
        this.state = state;
        this.render();
    }

    /** Opens the menu; from the keyboard or a click, the focus goes to its checked list. */
    open(focusFirst: boolean): void {
        this.element.hidden = false;
        this.opener.setAttribute("aria-expanded", "true");
        if (focusFirst) this.stepListButtons.get(this.state?.stepList ?? "openConflicts")?.focus();
    }

    close(returnFocus: boolean): void {
        if (!this.isOpen()) return;
        this.element.hidden = true;
        this.opener.setAttribute("aria-expanded", "false");
        if (returnFocus) this.opener.focus();
    }

    /**
     * Opens the menu with the row of `elementId` scrolled into view, leaving
     * the focus where it is, so a step from Next keeps the keyboard on Next.
     */
    openAt(elementId: string): void {
        this.open(false);
        this.rowStepButtonOf(elementId)?.scrollIntoView({ block: "nearest" });
    }

    /** Shows what a pick from a row did below the row, or clears it with `undefined`. */
    showRowOutcome(elementId: string, text: string | undefined): void {
        if (text === undefined) this.rowOutcomes.delete(elementId);
        else this.rowOutcomes.set(elementId, text);
        const outcome = this.rowOf(elementId)?.querySelector<HTMLElement>(".merge-menu__outcome");
        if (outcome) renderOutcome(outcome, text);
    }

    /** Writes every word again, after an update or a change of language. */
    render(): void {
        const state = this.state;
        const translate = this.translate;
        this.element.setAttribute("aria-label", translate(MERGE_MENU_TEXTS.more));
        this.stepHeading.textContent = translate(MERGE_LEGEND_TEXTS.stepList);
        this.stepListGroup.setAttribute("aria-label", translate(MERGE_LEGEND_TEXTS.stepList));
        for (const { list, label } of STEP_LISTS) {
            const radio = this.stepListButtons.get(list);
            if (!radio) continue;
            radio.setAttribute("aria-checked", String(list === state?.stepList));
            radio.textContent = translate(label);
        }
        this.showAllButton.textContent = translate(DIFF_LEGEND_TEXTS.showAll);
        this.showAllButton.disabled = !state?.canStep;
        this.renderRows(state);
        for (const [side, compareButton] of this.compareButtons) {
            compareButton.textContent = compareWithText(side, translate);
            compareButton.disabled = !state?.built;
        }
        this.reviewButton.textContent = reviewNotesText(state?.notesCount ?? 0, translate);
        this.reviewButton.disabled = !state?.notesCount;
        this.reviewButton.setAttribute("aria-haspopup", "dialog");
        this.reviewButton.setAttribute("aria-expanded", String(state?.notesOpen ?? false));
    }

    private renderRows(state: MergeMenuState | undefined): void {
        const rows = state?.rows ?? [];
        this.shapelessSection.hidden = rows.length === 0;
        this.shapelessHeadingText.textContent = shapelessHeadingText(rows.length, this.translate);
        const info = this.translate(MERGE_MENU_TEXTS.shapelessInfo);
        this.infoButton.setAttribute("aria-label", info);
        setMergeTooltip(this.infoButton, this.translate(MERGE_MENU_TEXTS.shapelessInfoTip));
        const listed = JSON.stringify([
            rows,
            this.translate(MERGE_PICK_TEXTS.undo),
            this.translate(MERGE_MARKER_LABELS.conflict),
        ]);
        if (listed !== this.listedRows) {
            this.listedRows = listed;
            const focusKey = this.focusedKey();
            this.shapelessList.replaceChildren(...rows.map((row) => this.rowItem(row)));
            if (focusKey !== undefined) this.focusByKey(focusKey);
        }
        for (const row of rows) {
            const stepButton = this.rowStepButtonOf(row.id);
            if (row.id === state?.current) stepButton?.setAttribute("aria-current", "true");
            else stepButton?.removeAttribute("aria-current");
        }
    }

    private rowItem(row: MergeShapelessRow): HTMLLIElement {
        const translate = this.translate;
        const item = createElement("li", "merge-menu__row");
        item.dataset.rowFor = row.id;
        const name = shapelessEntryText(row, translate);
        const stepButton = createButton("merge-menu__row-step", () =>
            this.actions.onShapeless(row.id),
        );
        stepButton.dataset.elementId = row.id;
        stepButton.dataset.focusKey = `step ${row.id}`;
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
        const picks = createElement("div", "merge-menu__row-picks");
        picks.setAttribute("role", "group");
        picks.setAttribute("aria-label", name);
        for (const side of MERGE_SIDES) {
            const kept = row.keptSide === side;
            const keepButton = createButton(
                "merge-menu__mini",
                () => {
                    if (!kept) this.actions.onPick(row.id, "element", side);
                },
                keepSideText(side, translate),
            );
            keepButton.dataset.focusKey = `keep ${side} ${row.id}`;
            keepButton.setAttribute("aria-pressed", String(kept));
            picks.append(keepButton);
        }
        if (row.undo !== undefined) {
            const scope = row.undo;
            const undoButton = createButton(
                "merge-menu__mini",
                () => this.actions.onUnpick(row.id, scope),
                translate(MERGE_PICK_TEXTS.undo),
            );
            undoButton.dataset.focusKey = `undo ${row.id}`;
            picks.append(undoButton);
        }
        const outcome = createElement("div", "merge-menu__outcome");
        outcome.setAttribute("role", "status");
        renderOutcome(outcome, this.rowOutcomes.get(row.id));
        item.append(stepButton, picks, outcome);
        return item;
    }

    private onKeyDown(event: KeyboardEvent): void {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            this.close(true);
            return;
        }
        const moves: Record<string, (index: number, count: number) => number> = {
            ArrowDown: (index, count) => (index + 1) % count,
            ArrowUp: (index, count) => (index - 1 + count) % count,
            Home: () => 0,
            End: (_index, count) => count - 1,
        };
        const move = moves[event.key];
        if (!move) return;
        const buttons = this.focusableButtons();
        if (buttons.length === 0) return;
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

    private rowOf(elementId: string): HTMLElement | undefined {
        return (
            [...this.shapelessList.querySelectorAll<HTMLElement>(".merge-menu__row")].find(
                (row) => row.dataset.rowFor === elementId,
            ) ?? undefined
        );
    }

    private rowStepButtonOf(elementId: string): HTMLButtonElement | undefined {
        return (
            this.rowOf(elementId)?.querySelector<HTMLButtonElement>(".merge-menu__row-step") ??
            undefined
        );
    }

    private focusedKey(): string | undefined {
        const focused = this.element.ownerDocument.activeElement;
        return focused instanceof HTMLElement && this.shapelessList.contains(focused)
            ? focused.dataset.focusKey
            : undefined;
    }

    // A pick that hides the focused button (Undo) moves the focus to its row's step button.
    private focusByKey(key: string): void {
        const sameButton = [
            ...this.shapelessList.querySelectorAll<HTMLElement>("[data-focus-key]"),
        ].find((candidate) => candidate.dataset.focusKey === key);
        if (sameButton) {
            sameButton.focus();
            return;
        }
        const elementId = key.split(" ").at(-1);
        if (elementId !== undefined) this.rowStepButtonOf(elementId)?.focus();
    }
}

function separator(): HTMLElement {
    const line = createElement("div", "merge-menu__separator");
    line.setAttribute("role", "separator");
    return line;
}

function renderOutcome(outcome: HTMLElement, text: string | undefined): void {
    outcome.hidden = text === undefined;
    outcome.textContent = text ?? "";
}
