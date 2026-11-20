import {
    type MergeHostOffers,
    type MergePaneStates,
    NO_MERGE_HOST_OFFERS,
    OpenElementXmlMergeCommand,
    PickMergeSideCommand,
    UnpickMergeCommand,
} from "@miragon/bpmn-modeler-shared";

import {
    actedOnPad,
    type MergeDecisionCommand,
    mergeDecisionCommandOf,
    type MergePaneRequest,
} from "../../domain/mergeActedDecision";
import {
    type MergeMenuRowContent,
    mergeMenuRows,
    rowOutcomeText,
} from "../../domain/mergeMenuRows";
import type { MergeCardAction } from "../../domain/mergeCardContent";
import { handMergeFactsOf } from "../../domain/mergeHandMergeCard";
import {
    mergeOutcomeCardContent,
    type MergeRememberedOutcome,
} from "../../domain/mergeOutcomeCard";
import {
    cardOnSelection,
    chooseOn,
    outcomeToShowAt,
    rowOutcome,
    settleOn,
} from "../../domain/mergeOutcomeCardRules";
import {
    answerStates,
    EMPTY_OUTCOME_MEMORY,
    type MergeOutcomeAnswer,
    type MergeOutcomeMemory,
    rememberSent,
} from "../../domain/mergeOutcomeMemory";
import { elementPickOf } from "../../domain/mergeElementPick";
import { keepRemovedWith } from "../../domain/mergeKeepRemovedWith";
import { MERGE_CARD_TEXTS } from "../../domain/mergeTexts";
import type { MergeTranslate } from "../../domain/mergeTranslate";
import type { MergeOutcomeCard } from "./mergeOutcomeCard";

export interface MergeOutcomesContext {
    readonly post: (
        command: PickMergeSideCommand | UnpickMergeCommand | OpenElementXmlMergeCommand,
    ) => void;
    readonly nameOf: (elementId: string) => string;
    /** Shows an element the card names, leaving the card open. */
    readonly select: (elementId: string) => void;
    readonly translate: MergeTranslate;
}

/**
 * What a merge pane's own decisions and merges by hand did: it sends them,
 * remembers them until the pane reloads ({@link MergeOutcomeMemory}), and
 * says the host's answer on the {@link MergeOutcomeCard} below a drawn
 * element, which follows the selection, or in the menu's row of a
 * shape-less one, with the answer's choices.
 */
export class MergeOutcomes {
    private memory: MergeOutcomeMemory = EMPTY_OUTCOME_MEMORY;
    private card: MergeOutcomeCard | undefined;
    private states: MergePaneStates | undefined;
    private offers: MergeHostOffers = NO_MERGE_HOST_OFFERS;

    constructor(private readonly context: MergeOutcomesContext) {}

    attachCard(card: MergeOutcomeCard): void {
        this.card = card;
    }

    /** Sends a decision or a merge by hand and remembers it, so the card can name what the outcome does not. */
    send(request: MergePaneRequest, { dropsHandMerges = false } = {}): void {
        this.memory = rememberSent(this.memory, request);
        this.context.post(protocolCommandOf(mergeDecisionCommandOf(request, { dropsHandMerges })));
    }

    /** A choice on the card or in a row: sends what it asks and closes a dismissed card. */
    choose(action: MergeCardAction): void {
        const { memory, send, close } = chooseOn(this.memory, action);
        this.memory = memory;
        if (close) this.card?.close();
        if (send) this.send(send.request, { dropsHandMerges: send.dropsHandMerges });
    }

    /** Reads the host's new states before the pane repaints; {@link settle} then shows the answer. */
    receive(states: MergePaneStates, offers: MergeHostOffers): MergeOutcomeAnswer {
        this.states = states;
        this.offers = offers;
        const { memory, answer } = answerStates(this.memory, states);
        this.memory = memory;
        return answer;
    }

    /**
     * After the repaint: does to the card what {@link settleOn} says, and
     * returns the words of the row outcome it announces, for the bar.
     */
    settle(answer: MergeOutcomeAnswer): readonly string[] | undefined {
        const { card, announce } = settleOn(this.memory, answer);
        if (card.kind === "show") this.showCard(card.outcome, { announce: true });
        else if (card.kind === "close") this.card?.close();
        else this.card?.remark();
        if (announce === undefined || !this.states) return undefined;
        const { nameOf, translate } = this.context;
        return rowOutcomeText(this.states, announce, { nameOf, translate, offers: this.offers });
    }

    /** The menu's rows, the row a decision was sent from saying what it did. */
    menuRows(): readonly MergeMenuRowContent[] {
        if (!this.states) return [];
        const { nameOf, translate } = this.context;
        return mergeMenuRows(this.states, rowOutcome(this.memory), {
            nameOf,
            translate,
            offers: this.offers,
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
            handMerge: handMergeFactsOf(
                elementPickOf(this.states, remembered.outcome.elementId),
                this.offers,
            ),
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
                onChoose: (action) => this.choose(action),
                closeLabel: translate(MERGE_CARD_TEXTS.close),
            },
            { announce },
        );
    }
}

function protocolCommandOf(
    command: MergeDecisionCommand,
): PickMergeSideCommand | UnpickMergeCommand | OpenElementXmlMergeCommand {
    switch (command.kind) {
        case "pick":
            return new PickMergeSideCommand(
                command.elementId,
                command.scope,
                command.side,
                command.dropsHandMerges,
            );
        case "unpick":
            return new UnpickMergeCommand(
                command.elementId,
                command.scope,
                command.dropsHandMerges,
            );
        case "openXmlMerge":
            return new OpenElementXmlMergeCommand(command.elementId, command.resume);
    }
}
