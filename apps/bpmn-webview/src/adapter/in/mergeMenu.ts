import type { MergePaneBuild } from "@miragon/bpmn-modeler-shared";
import {
    createButton,
    createElement,
    DIFF_LEGEND_TEXTS,
    MERGE_SIDES,
    type MergeSide,
} from "@miragon/bpmn-modeler-types";

import type { MergeMenuRowContent } from "../../domain/mergeMenuRows";
import type { MergeStepList } from "../../domain/mergeStepper";
import { MERGE_MENU_TEXTS, MERGE_STEP_TEXTS, reviewNotesText } from "../../domain/mergeBarTexts";
import { shapelessHeadingText } from "../../domain/mergeRowTexts";
import { compareWithText } from "../../domain/mergeTexts";
import type { MergeTranslate } from "../../domain/mergeTranslate";
import { MergeBuildButton } from "./mergeBuildButton";
import { type MergeMenuRowActions, MergeMenuRowList } from "./mergeMenuRowList";
import { closeMergePopupOnDismiss } from "./mergePopupDismissal";
import { installMergeTooltips } from "./mergeTooltip";

export interface MergeMenuActions extends MergeMenuRowActions {
    readonly onStepList: (list: MergeStepList) => void;
    readonly onShowAll: () => void;
    readonly onCompare: (against: MergeSide) => void;
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
 * click outside closes it.
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
    private readonly rowList: MergeMenuRowList;
    private readonly compareButtons: ReadonlyMap<MergeSide, HTMLButtonElement>;
    private readonly reviewButton: HTMLButtonElement;
    private readonly announcer = createElement("div", "merge-bar__visually-hidden");
    private state?: MergeMenuState;
    private byStep = false;

    constructor(
        actions: MergeMenuActions,
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
        this.rowList = new MergeMenuRowList(actions, translate, () =>
            this.focusableButtons()[0]?.focus(),
        );
        this.shapelessSection.append(
            separator(),
            this.shapelessHeading,
            this.stepped,
            this.rowList.element,
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
        this.rowList.rowOf(elementId)?.scrollIntoView({ block: "nearest" });
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
        this.rowList.render(rows, current);
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
}

function separator(): HTMLElement {
    const line = createElement("div", "merge-menu__separator");
    line.setAttribute("role", "separator");
    return line;
}
