import {
    type ApplyMergeStatesQuery,
    BuildMergeResultCommand,
    CompareMergeResultCommand,
    CursorChangedCommand,
    type MergePaneStates,
    type MergePaneStep,
    MergeStepListChangedCommand,
    PickMergeSideCommand,
    type ProtocolMessage,
    SHOW_ALL_CURSOR,
    UnpickMergeCommand,
    ViewportChangedCommand,
} from "@miragon/bpmn-modeler-shared";
import { i18n } from "@miragon/bpmn-modeler-i18n";
import type { MergeSide } from "@miragon/bpmn-modeler-types";

import {
    actedOnPad,
    keepRemovedFlowsDecision,
    type MergeActedDecision,
    mergeDecisionCommandOf,
} from "../../domain/mergeActedDecision";
import {
    mergeOutcomeCardContent,
    type MergeRememberedOutcome,
} from "../../domain/mergeOutcomeCard";
import {
    answerStates,
    cardOnAnswer,
    cardOnSelection,
    EMPTY_OUTCOME_MEMORY,
    headerOutcome,
    type MergeOutcomeMemory,
    outcomeToShowAt,
    rememberSent,
} from "../../domain/mergeOutcomeMemory";
import {
    decidesInLegend,
    type MergePadDecision,
    mergePadDecisions,
} from "../../domain/mergePadDecisions";
import { type MergeStepList, mergeStepPosition, nextMergeStep } from "../../domain/mergeStepper";
import {
    MERGE_CARD_TEXTS,
    MERGE_LEGEND_TEXTS,
    type MergeTranslate,
    mergeCaptionText,
    pickBadgeText,
} from "../../domain/mergeTexts";
import type { DiffPaneChannel } from "../../port/hostChannel";
import { DiffPanePlumbing } from "./diffPanePlumbing";
import { MergeLegend } from "./mergeLegend";
import { createMergeElementNamesModule, type MergeElementNames } from "./mergeElementNames";
import { createMergeMarksModule, type MergeMarks } from "./mergeMarks";
import { createMergeOutcomeCardModule, type MergeOutcomeCard } from "./mergeOutcomeCard";
import { createMergePickModule, type MergePickContextPadProvider } from "./mergePickContextPad";

const STEPS_OF: Readonly<
    Record<MergeStepList, (states: MergePaneStates) => readonly MergePaneStep[]>
> = {
    openConflicts: (states) => states.openConflictSteps,
    all: (states) => states.allSteps,
};

const translate: MergeTranslate = (key, replacements) => i18n.translate(key, replacements);

/**
 * Entry point for a webview running as one side of a BPMN merge view.
 *
 * On top of the {@link DiffPanePlumbing} it shares with a diff pane, it paints
 * the markers the host sends ({@link MergeMarks}), shows them in a
 * {@link MergeLegend} and steps through the host's step lists:
 *   - Incoming {@link ApplyMergeStatesQuery} → repaint everything from it, the
 *     full state of the merge view, and keep the stepper on its element.
 *   - Incoming {@link SyncCursorQuery} → move to the partner's step without
 *     re-emitting it.
 *   - Outgoing {@link CursorChangedCommand} on a user step, its index counted
 *     in `allSteps`, and {@link MergeStepListChangedCommand} when the user
 *     switches the list; the host keeps both for the tab and sends them with
 *     the states, so the partner walks the same list and a reloaded pane
 *     goes back to the step.
 *   - Outgoing {@link PickMergeSideCommand} and {@link UnpickMergeCommand}
 *     from the context pad's decisions, and from the legend's pick actions
 *     for a step no canvas draws; the host decides them and sends both
 *     panes their states again, so the pane shows a pick only once the host
 *     made it. The pane that sent it shows what it did as a
 *     {@link MergeOutcomeCard} below the element, and again whenever the
 *     element is selected again, until it reloads; the partner shows none.
 *     The legend still says what a decision on a shape-less element did.
 *   - Outgoing {@link ViewportChangedCommand} after a step only this pane
 *     draws, so the partner shows the same part of the diagram.
 *   - Outgoing {@link BuildMergeResultCommand} and
 *     {@link CompareMergeResultCommand} from the right pane's legend; the
 *     host builds, and its states say whether Build and the comparisons are
 *     enabled and what the last build noted.
 *
 * The stepper keeps its own cursor by element id: a decided conflict leaves
 * the open list, and the step after it goes on from its place. A step
 * selects its element, so diagram-js opens the context pad where it lands,
 * and a click on an element of the merge makes it the step.
 */
export class MergeMode {
    private readonly pane: DiffPanePlumbing;

    private readonly legend: MergeLegend;

    private marks: MergeMarks | undefined;

    private names: MergeElementNames | undefined;

    private pickPad: MergePickContextPadProvider | undefined;

    private card: MergeOutcomeCard | undefined;

    private outcomes: MergeOutcomeMemory = EMPTY_OUTCOME_MEMORY;

    private states: ApplyMergeStatesQuery | undefined;

    private stepList: MergeStepList = "openConflicts";

    private cursorId: string | undefined;

    constructor(
        canvas: HTMLElement,
        legendParent: HTMLElement,
        private readonly host: DiffPaneChannel,
    ) {
        this.pane = new DiffPanePlumbing(canvas, host, [
            createMergeMarksModule({ attach: (marks) => (this.marks = marks) }),
            createMergeElementNamesModule({ attach: (names) => (this.names = names) }),
            createMergePickModule({
                decisionsOf: (id) => (this.states ? mergePadDecisions(this.states.states, id) : []),
                decide: (id, decision) => this.decide(id, decision),
                attach: (pad) => (this.pickPad = pad),
            }),
            createMergeOutcomeCardModule({ attach: (card) => (this.card = card) }),
        ]);
        this.legend = new MergeLegend(
            legendParent,
            {
                onPrevious: () => this.step(-1),
                onNext: () => this.step(1),
                onShowAll: () => this.showAll(),
                onStepList: (list) => this.switchStepList(list),
                onShapeless: (id) => this.stepTo(id),
                onPick: (id, scope) =>
                    this.send({
                        kind: "keep",
                        elementId: id,
                        scope,
                        side: this.paneSide(),
                        origin: "legend",
                    }),
                onUnpick: (id, scope) =>
                    this.send({ kind: "undo", elementId: id, scope, origin: "legend" }),
                onSelect: (id) => this.select(id),
                onBuild: () => this.host.postMessage(new BuildMergeResultCommand()),
                onCompare: (against) =>
                    this.host.postMessage(new CompareMergeResultCommand(against)),
            },
            i18n,
        );
        this.legend.reserveRoomOn(document.body);
        this.pane.viewer.onSelectedElementChanged((id) => this.onUserSelected(id));
        i18n.onChange(() => {
            this.paintMarks();
            this.showCardAgain();
        });
    }

    /** Entry point, with the XML of the host's first {@link BpmnFileQuery}. */
    async startWith(initialContent: string): Promise<void> {
        await this.pane.start(initialContent, (query) => this.onMessage(query));
    }

    private onMessage(query: ProtocolMessage): void {
        switch (query.type) {
            case "ApplyMergeStatesQuery":
                this.pane.whenImported(() => this.paint(query));
                break;
            case "SyncCursorQuery":
                if (query.index === SHOW_ALL_CURSOR) {
                    this.backToWholeDiagram();
                } else {
                    const id = this.states?.states.allSteps[query.index]?.id;
                    if (id !== undefined) this.goTo(id, { shareViewport: true });
                }
                break;
        }
    }

    private paint(query: ApplyMergeStatesQuery): void {
        this.states = query;
        this.stepList = query.states.stepping.list;
        this.pane.tagSide(query.side);
        this.pane.offerElementXmlChanges(query.elementXmlChanges);
        this.paintMarks();
        this.pickPad?.refresh();
        this.pane.label(query.side, () => mergeCaptionText(query.states.caption, translate));
        const { memory, answer } = answerStates(this.outcomes, query.states);
        this.outcomes = memory;
        const kept = query.states.stepping.cursor;
        // A pane that reloaded has no step of its own; the host kept the tab's.
        if (this.cursorId === undefined && kept !== undefined && this.allStepIds().includes(kept)) {
            this.goTo(kept, { shareViewport: false });
        } else {
            this.updateLegend();
        }
        const change = cardOnAnswer(memory, answer);
        if (change.show !== undefined) {
            this.showCard(change.show, { announce: true });
        } else if (change.close) {
            this.card?.close();
        } else {
            this.card?.remark();
        }
    }

    private paintMarks(): void {
        if (!this.states) return;
        const { marks, badges, consequences } = this.states.states;
        this.marks?.paint(
            { marks, badges, consequences },
            {
                conflict: translate(MERGE_LEGEND_TEXTS.conflictBadge),
                badge: (badge) => pickBadgeText(badge, translate),
            },
        );
    }

    /** The side this pane shows, as the host's states name it. */
    private paneSide(): MergeSide {
        return this.states?.states.caption.side ?? "current";
    }

    /** Sends a decision and remembers it, so the card can name what the outcome does not. */
    private send(acted: MergeActedDecision): void {
        this.outcomes = rememberSent(this.outcomes, acted);
        const command = mergeDecisionCommandOf(acted);
        this.host.postMessage(
            command.kind === "pick"
                ? new PickMergeSideCommand(command.elementId, command.scope, command.side)
                : new UnpickMergeCommand(command.elementId, command.scope),
        );
    }

    private decide(id: string, decision: MergePadDecision): void {
        this.send(actedOnPad(id, decision));
    }

    private showCard(
        remembered: MergeRememberedOutcome,
        { announce }: { readonly announce: boolean },
    ): void {
        if (!this.states) return;
        const content = mergeOutcomeCardContent(remembered, {
            restoreOffer: this.states.states.restoreOffer,
            nameOf: (id) => this.nameOf(id),
            translate,
        });
        this.card?.show(
            content,
            {
                onSelect: (id) => this.select(id, { keepCard: true }),
                onKeepRemovedFlows: (id) =>
                    this.send(keepRemovedFlowsDecision(id, this.paneSide())),
                closeLabel: translate(MERGE_CARD_TEXTS.close),
            },
            { announce },
        );
    }

    /** Rewrites a shown card, as after a change of language, without announcing it again. */
    private showCardAgain(): void {
        const remembered = outcomeToShowAt(this.outcomes, this.card?.shownAt);
        if (remembered !== undefined) this.showCard(remembered, { announce: false });
    }

    /** The card follows the selection ({@link cardOnSelection}); shown again, it announces nothing. */
    private cardFollows(id: string | undefined): void {
        const change = cardOnSelection(this.outcomes, this.card?.shownAt, id);
        if (change.close) this.card?.close();
        if (change.show !== undefined) this.showCard(change.show, { announce: false });
    }

    /** A user's click on an element of the merge the user can pick makes it the step. */
    private onUserSelected(id: string | undefined): void {
        this.cardFollows(id);
        const pickable = this.states?.states.pickable.some((entry) => entry.id === id);
        if (
            id !== undefined &&
            id !== this.cursorId &&
            pickable &&
            this.allStepIds().includes(id)
        ) {
            this.stepTo(id);
        }
    }

    /**
     * An element the legend or the card names: a step goes there with the
     * partner, anything else only shows here. A card's link leaves the card
     * open.
     */
    private select(id: string, { keepCard = false }: { readonly keepCard?: boolean } = {}): void {
        if (this.allStepIds().includes(id)) {
            this.stepTo(id, { keepCard });
        } else {
            this.pane.viewer.focusElement(id);
        }
    }

    /** The host names an element the same on both panes; this canvas names the rest. */
    private nameOf(id: string): string {
        return this.states?.states.names[id] ?? this.names?.nameOf(id) ?? id;
    }

    private stepIds(): readonly string[] {
        return this.states ? STEPS_OF[this.stepList](this.states.states).map(({ id }) => id) : [];
    }

    private allStepIds(): readonly string[] {
        return this.states?.states.allSteps.map(({ id }) => id) ?? [];
    }

    private step(direction: 1 | -1): void {
        const id = nextMergeStep(this.stepIds(), this.allStepIds(), this.cursorId, direction);
        if (id !== undefined) this.stepTo(id);
    }

    /** A user's step: moves there and takes the partner pane along. */
    private stepTo(id: string, { keepCard = false }: { readonly keepCard?: boolean } = {}): void {
        this.goTo(id, { shareViewport: false, keepCard });
        this.host.postMessage(new CursorChangedCommand(this.allStepIds().indexOf(id)));
        this.shareViewportOnStepOnlyHere(id);
    }

    /**
     * Shows the step on this pane: a drawn element in the centre at the
     * current zoom, selected, so its context pad opens; a shape-less one by
     * its legend entry. The element's plane is entered first, since a
     * selection holds only on the plane shown. On a step only the partner
     * pane draws, or one without a shape, the pane clears its selection; it
     * keeps its place, since a neighbour here would point elsewhere, but
     * shows the plane the partner stepped into, so their viewports still
     * match, or notes that this version lacks it.
     */
    private goTo(
        id: string,
        {
            shareViewport,
            keepCard = false,
        }: { readonly shareViewport: boolean; readonly keepCard?: boolean },
    ): void {
        this.cursorId = id;
        const step = this.stepOf(id);
        let selected: string | undefined;
        if (step?.onThisPane && !step.shapeless && this.pane.viewer.focusElement(id)) {
            this.pane.notePlaneShown(step.plane);
            this.pane.viewer.mirrorSelection(id);
            selected = id;
        } else {
            this.pane.viewer.clearSelectionMarker();
            this.pane.viewer.mirrorSelection(undefined);
            if (step !== undefined && !step.shapeless) this.pane.followPlane(step.plane);
        }
        if (!keepCard) this.cardFollows(selected);
        this.updateLegend();
        if (shareViewport) this.shareViewportOnStepOnlyHere(id);
    }

    /** The partner draws nothing for a step only this pane draws, so it takes this pane's viewport. */
    private shareViewportOnStepOnlyHere(id: string): void {
        const step = this.stepOf(id);
        if (step?.onThisPane && !step.onOtherPane && !step.shapeless) {
            this.host.postMessage(new ViewportChangedCommand(this.pane.viewer.getViewport()));
        }
    }

    private stepOf(id: string): MergePaneStep | undefined {
        return this.states?.states.allSteps.find((candidate) => candidate.id === id);
    }

    private switchStepList(list: MergeStepList): void {
        this.stepList = list;
        this.updateLegend();
        this.host.postMessage(new MergeStepListChangedCommand(list));
    }

    private showAll(): void {
        this.backToWholeDiagram();
        this.host.postMessage(new CursorChangedCommand(SHOW_ALL_CURSOR));
    }

    private backToWholeDiagram(): void {
        this.cursorId = undefined;
        this.pane.viewer.fitDiagram();
        this.pane.notePlaneShown(undefined);
        this.updateLegend();
    }

    private steppedInLegend() {
        const step = this.cursorId === undefined ? undefined : this.stepOf(this.cursorId);
        if (step === undefined || !decidesInLegend(step)) return undefined;
        return this.states?.states.pickable.find(({ id }) => id === step.id);
    }

    private updateLegend(): void {
        if (!this.states) return;
        const { states } = this.states;
        this.legend.update({
            counts: states.counts,
            canStep: this.stepIds().length > 0,
            position: mergeStepPosition(this.stepIds(), this.allStepIds(), this.cursorId),
            openConflicts: states.openConflicts,
            stepList: this.stepList,
            shapeless: states.shapeless,
            current: this.cursorId,
            picking: {
                side: states.caption.side,
                stepped: this.steppedInLegend(),
                picksNotDrawn: states.picksNotDrawn,
                ...headerOutcome(this.outcomes, states),
                nameOf: (id) => this.nameOf(id),
            },
            // The right pane's half carries the build, as a diff pane's carries the changes.
            building:
                this.states.side === "after"
                    ? { build: states.build, nameOf: (id) => this.nameOf(id) }
                    : undefined,
        });
    }
}
