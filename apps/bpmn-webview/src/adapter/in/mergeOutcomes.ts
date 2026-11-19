import {
    type MergePaneStates,
    PickMergeSideCommand,
    UnpickMergeCommand,
} from "@miragon/bpmn-modeler-shared";

import {
    actedOnPad,
    type MergeActedDecision,
    mergeDecisionCommandOf,
} from "../../domain/mergeActedDecision";
import {
    type MergeMenuRowContent,
    mergeMenuRows,
    rowOutcomeText,
} from "../../domain/mergeMenuRows";
import {
    mergeOutcomeCardContent,
    type MergeRememberedOutcome,
} from "../../domain/mergeOutcomeCard";
import {
    answerStates,
    cardOnAnswer,
    cardOnSelection,
    EMPTY_OUTCOME_MEMORY,
    type MergeOutcomeAnswer,
    type MergeOutcomeMemory,
    outcomeToShowAt,
    rememberSent,
    rowOutcome,
} from "../../domain/mergeOutcomeMemory";
import { keepRemovedWith } from "../../domain/mergePadDecisions";
import { MERGE_CARD_TEXTS, type MergeTranslate } from "../../domain/mergeTexts";
import type { MergeOutcomeCard } from "./mergeOutcomeCard";

export interface MergeOutcomesContext {
    readonly post: (command: PickMergeSideCommand | UnpickMergeCommand) => void;
    readonly nameOf: (elementId: string) => string;
    /** Shows an element the card names, leaving the card open. */
    readonly select: (elementId: string) => void;
    readonly translate: MergeTranslate;
}

/**
 * What a merge pane's own decisions did: it sends them, remembers them
 * until the pane reloads ({@link MergeOutcomeMemory}), and says the host's
 * answer on the {@link MergeOutcomeCard} below a drawn element, which
 * follows the selection, or in the menu's row of a shape-less one.
 */
export class MergeOutcomes {
    private memory: MergeOutcomeMemory = EMPTY_OUTCOME_MEMORY;
    private card: MergeOutcomeCard | undefined;
    private states: MergePaneStates | undefined;

    constructor(private readonly context: MergeOutcomesContext) {}

    attachCard(card: MergeOutcomeCard): void {
        this.card = card;
    }

    /** Sends a decision and remembers it, so the card can name what the outcome does not. */
    send(acted: MergeActedDecision): void {
        this.memory = rememberSent(this.memory, acted);
        const command = mergeDecisionCommandOf(acted);
        this.context.post(
            command.kind === "pick"
                ? new PickMergeSideCommand(command.elementId, command.scope, command.side)
                : new UnpickMergeCommand(command.elementId, command.scope),
        );
    }

    /** Reads the host's new states before the pane repaints; {@link settle} then shows the answer. */
    receive(states: MergePaneStates): MergeOutcomeAnswer {
        this.states = states;
        const { memory, answer } = answerStates(this.memory, states);
        this.memory = memory;
        return answer;
    }

    /**
     * After the repaint: shows this pane's new outcome, closes the card on
     * another, or marks its blockers again. Returns what a row's newly
     * answered decision did, for the bar to announce once.
     */
    settle(answer: MergeOutcomeAnswer): readonly string[] | undefined {
        const change = cardOnAnswer(this.memory, answer);
        if (change.show !== undefined) {
            this.showCard(change.show, { announce: true });
        } else if (change.close) {
            this.card?.close();
        } else {
            this.card?.remark();
        }
        const fromRow = rowOutcome(this.memory);
        if (answer !== "show" || fromRow === undefined || !this.states) return undefined;
        const { nameOf, translate } = this.context;
        return rowOutcomeText(this.states, fromRow, { nameOf, translate });
    }

    /** The menu's rows, the row a decision was sent from saying what it did. */
    menuRows(elementXmlChanges: boolean): readonly MergeMenuRowContent[] {
        if (!this.states) return [];
        const { nameOf, translate } = this.context;
        return mergeMenuRows(this.states, rowOutcome(this.memory), {
            nameOf,
            translate,
            elementXmlChanges,
        });
    }

    /** The card follows the selection ({@link cardOnSelection}); shown again, it announces nothing. */
    follow(selectedId: string | undefined): void {
        const change = cardOnSelection(this.memory, this.card?.shownAt, selectedId);
        if (change.close) this.card?.close();
        if (change.show !== undefined) this.showCard(change.show, { announce: false });
    }

    /** Rewrites a shown card, as after a change of language, without announcing it again. */
    rewrite(): void {
        const remembered = outcomeToShowAt(this.memory, this.card?.shownAt);
        if (remembered !== undefined) this.showCard(remembered, { announce: false });
    }

    private showCard(
        remembered: MergeRememberedOutcome,
        { announce }: { readonly announce: boolean },
    ): void {
        if (!this.states) return;
        const { nameOf, select, translate } = this.context;
        const content = mergeOutcomeCardContent(remembered, {
            restoreOffer: this.states.restoreOffer,
            nameOf,
            translate,
        });
        this.card?.show(
            content,
            {
                onSelect: (id) => select(id),
                onKeepRemovedWith: (id) => {
                    const decision = this.states && keepRemovedWith(this.states, id);
                    if (decision) this.send(actedOnPad(id, decision));
                },
                closeLabel: translate(MERGE_CARD_TEXTS.close),
            },
            { announce },
        );
    }
}
