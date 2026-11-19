import { createButton, createElement, MERGE_MARKER_CLASSES } from "@miragon/bpmn-modeler-types";

import type { MergeMenuRowContent } from "../../domain/mergeMenuRows";
import type { MergeCardAction } from "../../domain/mergeOutcomeCard";
import {
    keepsEverythingInside,
    type MergePadDecision,
    type MergeRowDecision,
    type MergeRowKeepInside,
} from "../../domain/mergePadDecisions";
import { MERGE_MARKER_LABELS } from "../../domain/mergeBarTexts";
import {
    decisionButtonText,
    shapelessEntryText,
    shapelessValueLines,
} from "../../domain/mergeRowTexts";
import { padDecisionText } from "../../domain/mergeTexts";
import type { MergeTranslate } from "../../domain/mergeTranslate";
import { MERGE_DECISION_ICONS } from "./mergeDecisionIcons";
import { CODE_ICON_SVG, ELEMENT_XML_CHANGES_TITLE } from "./elementXmlEntry";
import { MERGE_TOOLTIP_ATTRIBUTE } from "./mergeTooltip";

export interface MergeMenuRowActions {
    /** Steps to a shape-less element from its row. */
    readonly onShapeless: (elementId: string) => void;
    readonly onDecide: (elementId: string, decision: MergePadDecision) => void;
    /** Opens a shape-less element's XML changes from its row, as the pad does for a drawn one. */
    readonly onXmlChanges: (elementId: string) => void;
    /** A choice the row's outcome offers, as the card's do. */
    readonly onChoose: (action: MergeCardAction) => void;
}

interface FocusedRowButton {
    readonly rowId: string;
    readonly key: string;
}

/**
 * The "…" menu's rows of shape-less elements, each with its values, its
 * decisions and what its last decision did. The rows are rebuilt only when
 * they change; the focus then stays on the same button, or moves to its
 * row's first decision, or to the next row, or the one before at the end.
 */
export class MergeMenuRowList {
    readonly element = createElement("ul", "merge-menu__rows");
    private listedRows?: string;

    constructor(
        private readonly actions: MergeMenuRowActions,
        private readonly translate: MergeTranslate,
        /** Takes the focus when a rebuild leaves no row to put it on. */
        private readonly focusOutsideRows: () => void,
    ) {}

    render(rows: readonly MergeMenuRowContent[], current: string | undefined): void {
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
            this.element.replaceChildren(...rows.map((row) => this.rowItem(row)));
            if (focused) this.refocus(focused, previousIds);
        }
        for (const item of this.rowItems()) {
            const stepButton = item.querySelector<HTMLElement>(".merge-menu__row-step");
            if (item.dataset.rowFor === current) stepButton?.setAttribute("aria-current", "true");
            else stepButton?.removeAttribute("aria-current");
        }
    }

    rowOf(elementId: string): HTMLElement | undefined {
        return this.rowItems().find((item) => item.dataset.rowFor === elementId);
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
        decisions.append(...row.decisions.map((decision) => this.decisionButton(row.id, decision)));
        if (row.xmlChanges) decisions.append(this.xmlChangesButton(row.id));
        const outcome = createElement("div", "merge-menu__outcome");
        outcome.hidden = row.outcome === undefined;
        outcome.append(...(row.outcome ?? []).map((line) => createElement("span", "", line)));
        if (row.choices !== undefined && row.choices.length > 0) {
            const choices = createElement("div", "merge-menu__row-picks");
            choices.append(
                ...row.choices.map(({ action, text }) => {
                    const choice = createButton(
                        "merge-menu__mini",
                        () => this.actions.onChoose(action),
                        text,
                    );
                    choice.dataset.focusKey = `choice:${action}`;
                    return choice;
                }),
            );
            outcome.append(choices);
        }
        item.append(stepButton, values, decisions, outcome);
        return item;
    }

    private decisionButton(elementId: string, decision: MergeRowDecision): HTMLButtonElement {
        const { label, tooltip } = padDecisionText(decision, this.translate);
        const decisionButton = keepsEverythingInside(decision)
            ? this.keepInsideButton(elementId, decision)
            : this.wordedButton(elementId, decision);
        decisionButton.setAttribute("aria-label", label);
        decisionButton.setAttribute(MERGE_TOOLTIP_ATTRIBUTE, tooltip);
        return decisionButton;
    }

    private wordedButton(
        elementId: string,
        decision: Exclude<MergeRowDecision, MergeRowKeepInside>,
    ): HTMLButtonElement {
        const worded = createButton(
            "merge-menu__mini",
            () => this.actions.onDecide(elementId, decision),
            decisionButtonText(decision, this.translate),
        );
        worded.dataset.focusKey = JSON.stringify(decision);
        return worded;
    }

    /** Pressed, it is inert: only Undo takes the pick back. */
    private keepInsideButton(elementId: string, decision: MergeRowKeepInside): HTMLButtonElement {
        const { pressed, ...picked } = decision;
        const keepInside = createButton(
            "merge-menu__mini merge-menu__icon merge-menu__keep-inside",
            () => {
                if (!pressed) this.actions.onDecide(elementId, picked);
            },
        );
        // Without the pressed state, so the focus stays on it when the pick repaints it.
        keepInside.dataset.focusKey = JSON.stringify(picked);
        keepInside.innerHTML = MERGE_DECISION_ICONS.keepInside;
        keepInside.setAttribute("aria-pressed", String(pressed === true));
        if (pressed) keepInside.setAttribute("aria-disabled", "true");
        return keepInside;
    }

    private xmlChangesButton(elementId: string): HTMLButtonElement {
        const title = this.translate(ELEMENT_XML_CHANGES_TITLE);
        const xmlButton = createButton("merge-menu__mini merge-menu__icon merge-menu__xml", () =>
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
    private refocus(focused: FocusedRowButton, previousIds: readonly string[]): void {
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
            fallback?.querySelector<HTMLButtonElement>("button");
        if (target) target.focus();
        else this.focusOutsideRows();
    }

    private focusedRowButton(): FocusedRowButton | undefined {
        const focused = this.element.ownerDocument.activeElement;
        if (!(focused instanceof HTMLElement) || !this.element.contains(focused)) return undefined;
        const rowId = focused.closest<HTMLElement>(".merge-menu__row")?.dataset.rowFor;
        return rowId === undefined ? undefined : { rowId, key: focused.dataset.focusKey ?? "" };
    }

    private rowItems(): HTMLElement[] {
        return [...this.element.querySelectorAll<HTMLElement>(".merge-menu__row")];
    }
}
