import type {
    MergePaneOutcome,
    MergePanePickable,
    MergePanePickNotDrawn,
    MergePaneRestoreOffer,
    MergePickScope,
} from "@miragon/bpmn-modeler-shared";
import { createButton, createElement, type MergeSide } from "@miragon/bpmn-modeler-types";

import {
    blockText,
    keepSideText,
    MERGE_PICK_TEXTS,
    type MergeTranslate,
    outcomeHeadline,
    pickNotDrawnText,
    restoreOfferText,
} from "../../domain/mergeTexts";

export interface MergePickActions {
    readonly onPick: (elementId: string, scope: MergePickScope) => void;
    readonly onUnpick: (elementId: string, scope: MergePickScope) => void;
    /** Shows an element the panel names, on this pane. */
    readonly onSelect: (elementId: string) => void;
}

/** What the pick part of a merge pane's legend shows; the host decided all of it. */
export interface MergePickState {
    readonly side: MergeSide;
    /** What a pick can do with the stepped element no canvas draws; absent on any other step. */
    readonly stepped?: MergePanePickable;
    readonly picksNotDrawn: readonly MergePanePickNotDrawn[];
    readonly lastOutcome?: MergePaneOutcome;
    readonly restoreOffer?: MergePaneRestoreOffer;
    readonly nameOf: (elementId: string) => string;
}

const OUTCOME_LISTS = [
    { key: "pulledIn", label: MERGE_PICK_TEXTS.pulledIn },
    { key: "dropped", label: MERGE_PICK_TEXTS.dropped },
    { key: "reopened", label: MERGE_PICK_TEXTS.reopened },
] as const;

/**
 * The pick part of a merge pane's legend: the actions for a stepped element
 * no canvas draws, which the context pad cannot reach, the user's picks this pane
 * cannot draw with their undo, and what the last pick or undo did, with the
 * offer to keep the flows removed with a kept element. The action buttons
 * stay in place across updates, so the focus stays on the one just pressed;
 * where an update hides or removes the focused control, the focus moves to
 * the Keep action or to what the last pick did. What the last pick did is
 * rebuilt only when it changes, so a screen reader announces it once.
 */
export class MergePickPanel {
    readonly element = createElement("div", "merge-legend__picking");
    private readonly actionsGroup = createElement("div", "merge-legend__pick-actions");
    private readonly keepButton: HTMLButtonElement;
    private readonly keepInsideButton: HTMLButtonElement;
    private readonly undoButton: HTMLButtonElement;
    private readonly picksGroup = createElement("div", "merge-legend__picks");
    private readonly picksLabel = createElement("span", "merge-legend__picks-label");
    private readonly picksList = createElement("ul", "merge-legend__picks-list");
    private readonly feedback = createElement("div", "merge-legend__feedback");
    private state?: MergePickState;
    private shownFeedback?: string;

    constructor(
        private readonly actions: MergePickActions,
        private readonly translate: MergeTranslate,
    ) {
        const onStepped = (run: (stepped: MergePanePickable) => void) => () => {
            if (this.state?.stepped) run(this.state.stepped);
        };
        this.keepButton = createButton(
            "diff-legend__nav-btn merge-legend__pick",
            onStepped(({ id }) => actions.onPick(id, "element")),
        );
        this.keepInsideButton = createButton(
            "diff-legend__nav-btn merge-legend__pick",
            onStepped(({ id }) => actions.onPick(id, "withContents")),
        );
        this.undoButton = createButton(
            "diff-legend__nav-btn merge-legend__pick",
            onStepped(({ id, undo }) => {
                if (undo !== undefined) actions.onUnpick(id, undo);
            }),
        );
        this.actionsGroup.setAttribute("role", "group");
        this.actionsGroup.append(this.keepButton, this.keepInsideButton, this.undoButton);
        this.picksGroup.append(this.picksLabel, this.picksList);
        this.feedback.setAttribute("role", "status");
        this.element.append(this.actionsGroup, this.picksGroup, this.feedback);
    }

    update(state: MergePickState): void {
        this.state = state;
        const feedback = JSON.stringify([state.lastOutcome, state.restoreOffer]);
        const feedbackChanged = feedback !== this.shownFeedback;
        this.shownFeedback = feedback;
        this.render(feedbackChanged);
    }

    /** Writes every word again, after an update or a change of language. */
    render(rebuildFeedback = true): void {
        const state = this.state;
        this.keepingFocus(() => {
            this.actionsGroup.hidden = state?.stepped === undefined;
            this.keepInsideButton.hidden = !state?.stepped?.container;
            this.undoButton.hidden = state?.stepped?.undo === undefined;
            if (state) this.keepButton.textContent = keepSideText(state.side, this.translate);
            this.keepInsideButton.textContent = this.translate(MERGE_PICK_TEXTS.keepInside);
            this.undoButton.textContent = this.translate(MERGE_PICK_TEXTS.undo);
            this.actionsGroup.setAttribute("aria-label", this.translate(MERGE_PICK_TEXTS.keepThis));
            this.picksLabel.textContent = this.translate(MERGE_PICK_TEXTS.yourPicks);
            this.renderPicks(state);
            if (rebuildFeedback) this.renderFeedback(state);
        });
    }

    private renderPicks(state: MergePickState | undefined): void {
        const picks = state?.picksNotDrawn ?? [];
        this.picksGroup.hidden = picks.length === 0;
        this.picksList.replaceChildren(
            ...picks.map(({ id, keptSide, scope }) => {
                const text = pickNotDrawnText(keptSide, state?.nameOf(id) ?? id, this.translate);
                const item = createElement("li", "merge-legend__picks-item");
                const entry = createButton(
                    "merge-legend__shapeless-entry",
                    () => this.actions.onSelect(id),
                    text,
                );
                entry.dataset.focusKey = `pick ${id}`;
                const undo = createButton(
                    "diff-legend__nav-btn merge-legend__pick",
                    () => this.actions.onUnpick(id, scope),
                    this.translate(MERGE_PICK_TEXTS.undo),
                );
                undo.dataset.focusKey = `undo ${id}`;
                undo.setAttribute(
                    "aria-label",
                    `${this.translate(MERGE_PICK_TEXTS.undo)}: ${text}`,
                );
                item.append(entry, undo);
                return item;
            }),
        );
    }

    private renderFeedback(state: MergePickState | undefined): void {
        const outcome = state?.lastOutcome;
        this.feedback.hidden = outcome === undefined && state?.restoreOffer === undefined;
        if (!state) return;
        const parts: HTMLElement[] = [];
        if (outcome) {
            const headline = createElement(
                "span",
                "merge-legend__feedback-headline",
                outcomeHeadline(outcome, state.nameOf, this.translate),
            );
            headline.tabIndex = -1;
            parts.push(headline);
            if (outcome.applied) {
                for (const { key, label } of OUTCOME_LISTS) {
                    if (outcome[key].length > 0) {
                        parts.push(
                            this.elementRow(key, this.translate(label), outcome[key], state),
                        );
                    }
                }
            } else {
                const reasons = createElement("ul", "merge-legend__feedback-reasons");
                reasons.append(
                    ...outcome.blockedBy.map((block) =>
                        createElement("li", "", blockText(block, state.nameOf, this.translate)),
                    ),
                );
                parts.push(reasons);
            }
        }
        const offer = state.restoreOffer;
        if (offer) {
            const restore = createButton(
                "diff-legend__nav-btn merge-legend__restore",
                () => this.actions.onPick(offer.elementId, "withConnections"),
                restoreOfferText(offer, this.translate),
            );
            restore.dataset.focusKey = "restore";
            parts.push(restore);
        }
        this.feedback.replaceChildren(...parts);
    }

    private elementRow(
        key: string,
        label: string,
        ids: readonly string[],
        state: MergePickState,
    ): HTMLElement {
        const row = createElement("span", "merge-legend__feedback-row");
        row.append(
            createElement("span", "merge-legend__feedback-label", label),
            ...ids.map((id) => {
                const select = createButton(
                    "merge-legend__shapeless-entry",
                    () => this.actions.onSelect(id),
                    state.nameOf(id),
                );
                select.dataset.focusKey = `${key} ${id}`;
                return select;
            }),
        );
        return row;
    }

    /**
     * A rebuild moves the focus to the new button of the same entry. Where the
     * focused control is hidden or gone, the focus goes to the Keep action or
     * to what the last pick did, never to the page.
     */
    private keepingFocus(rebuild: () => void): void {
        const focused = this.element.ownerDocument.activeElement;
        if (!(focused instanceof HTMLElement) || !this.element.contains(focused)) {
            rebuild();
            return;
        }
        const key = focused.dataset.focusKey;
        rebuild();
        if (this.isShown(focused)) return;
        const sameEntry =
            key === undefined
                ? undefined
                : this.element.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(key)}"]`);
        const headline = this.feedback.querySelector<HTMLElement>(
            ".merge-legend__feedback-headline",
        );
        [sameEntry, this.keepButton, headline]
            .find(
                (candidate): candidate is HTMLElement =>
                    candidate != null && this.isShown(candidate),
            )
            ?.focus();
    }

    private isShown(element: HTMLElement): boolean {
        return this.element.contains(element) && element.closest("[hidden]") === null;
    }
}
