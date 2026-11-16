import {
    type ApplyMergeStatesQuery,
    BuildMergeResultCommand,
    CompareMergeResultCommand,
    CursorChangedCommand,
    type MergePaneStates,
    type MergePaneStep,
    type MergePickScope,
    MergeStepListChangedCommand,
    PickMergeSideCommand,
    type ProtocolMessage,
    SHOW_ALL_CURSOR,
    UnpickMergeCommand,
    ViewportChangedCommand,
} from "@miragon/bpmn-modeler-shared";
import { i18n } from "@miragon/bpmn-modeler-i18n";

import type { MergeSide } from "@miragon/bpmn-modeler-types";

import type { MergeActedDecision } from "../../domain/mergeActedDecision";
import { mergeElementLabel } from "../../domain/mergeElementLabel";
import {
    answersActedDecision,
    mergeOutcomeCardContent,
    mergeOutcomeLine,
} from "../../domain/mergeOutcomeCard";
import { type MergePadDecision, mergePadDecisions } from "../../domain/mergePadDecisions";
import { mergeShapelessRows, openShapelessConflicts } from "../../domain/mergeShapelessRows";
import { type MergeStepList, mergeStepPosition, nextMergeStep } from "../../domain/mergeStepper";
import {
    MERGE_LEGEND_TEXTS,
    MERGE_PAD_TEXTS,
    type MergeTranslate,
    pickBadgeText,
} from "../../domain/mergeTexts";
import type { DiffPaneChannel } from "../../port/hostChannel";
import { DiffPanePlumbing } from "./diffPanePlumbing";
import { MergeBar } from "./mergeBar";
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

// Fitted, a task is about 40px wide: its name, its pad and its card do not fit around it.
const STEP_MIN_SCALE = 1;

/**
 * Where a step comes from: the user's stepper or menu, a click on the
 * canvas, a link on the outcome card, the partner pane, or the host's
 * stepping after a reload. Each shows the step a little differently.
 */
type StepOrigin = "stepper" | "canvasClick" | "card" | "partner" | "restore";

/**
 * Entry point for a webview running as one side of a BPMN merge view.
 *
 * On top of the {@link DiffPanePlumbing} it shares with a diff pane, it paints
 * the markers the host sends ({@link MergeMarks}), shows them in a
 * {@link MergeBar} with the pane's caption and steps through the host's step
 * lists:
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
 *     from the context pad, the outcome card and the menu's shape-less rows;
 *     the host decides them and sends both panes their states again, so the
 *     pane shows a pick only once the host made it. The pane that sent it
 *     shows what it did as a {@link MergeOutcomeCard} at the element, or in
 *     the menu row of a shape-less one; the partner shows none.
 *   - Outgoing {@link BuildMergeResultCommand} and
 *     {@link CompareMergeResultCommand} from the right pane's bar; the
 *     host builds, and its states say whether Build and the comparisons are
 *     enabled and what the last build noted.
 *
 * The stepper keeps its own cursor by element id: a decided conflict leaves
 * the open list, and the step after it goes on from its place. A step
 * selects its element, so the context pad opens where it lands, and a click
 * on an element of the walked list makes it the step. A step zooms in to at
 * least 100 %, and on a step only one pane draws, that pane hands its
 * viewport to the other, so both show the same part of the diagram.
 */
export class MergeMode {
    private readonly pane: DiffPanePlumbing;

    private readonly bar: MergeBar;

    private marks: MergeMarks | undefined;

    private names: MergeElementNames | undefined;

    private pickPad: MergePickContextPadProvider | undefined;

    private card: MergeOutcomeCard | undefined;

    // The pick or undo this pane sent, until the host's states answer it.
    private acted: MergeActedDecision | undefined;

    // The shape-less row showing what its pick did, cleared on the next step.
    private rowOutcomeId: string | undefined;

    private states: ApplyMergeStatesQuery | undefined;

    private stepList: MergeStepList = "openConflicts";

    private cursorId: string | undefined;

    constructor(
        private readonly canvas: HTMLElement,
        legendParent: HTMLElement,
        private readonly host: DiffPaneChannel,
    ) {
        this.pane = new DiffPanePlumbing(canvas, host, [
            createMergeMarksModule({ attach: (marks) => (this.marks = marks) }),
            createMergeElementNamesModule({ attach: (names) => (this.names = names) }),
            createMergePickModule({
                decisionsOf: (id) => this.padDecisionsOf(id),
                decide: (id, decision) => this.decideOnPad(id, decision),
                attach: (pad) => (this.pickPad = pad),
            }),
            createMergeOutcomeCardModule({ attach: (card) => (this.card = card) }),
        ]);
        this.bar = new MergeBar(
            legendParent,
            {
                onPrevious: () => this.step(-1),
                onNext: () => this.step(1),
                onShowAll: () => this.showAll(),
                onStepList: (list) => this.switchStepList(list),
                onShapeless: (id) => this.stepTo(id),
                onPick: (id, scope, side) => this.pick(id, scope, side),
                onUnpick: (id, scope) => this.unpick(id, scope),
                onSelect: (id) => this.select(id),
                onBuild: () => this.host.postMessage(new BuildMergeResultCommand()),
                onCompare: (against) =>
                    this.host.postMessage(new CompareMergeResultCommand(against)),
            },
            i18n,
        );
        this.bar.reserveRoomOn(document.body);
        this.pane.onPlaneMissingChanged((missing) => this.bar.showPlaneMissing(missing));
        this.pane.viewer.onSelectedElementChanged((id) => this.onUserSelected(id));
        i18n.onChange(() => this.paintMarks());
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
                    if (id !== undefined) {
                        this.goTo(id, "partner");
                        this.shareViewportIfOnlyHereDrawn(id);
                    }
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
        const kept = query.states.stepping.cursor;
        // A pane that reloaded has no step of its own; the host kept the tab's.
        if (this.cursorId === undefined && kept !== undefined && this.allStepIds().includes(kept)) {
            this.goTo(kept, "restore");
        } else {
            this.updateBar();
        }
        this.showOutcome(query.states);
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

    /** The side this pane shows; incoming until the host's first states say otherwise. */
    private paneSide(): MergeSide {
        return this.states?.states.caption.side ?? "incoming";
    }

    private pick(id: string, scope: MergePickScope, side?: MergeSide): void {
        this.acted = { action: "pick", elementId: id, scope, side: side ?? this.paneSide() };
        this.host.postMessage(new PickMergeSideCommand(id, scope, side));
    }

    private unpick(id: string, scope: MergePickScope): void {
        this.acted = { action: "unpick", elementId: id, scope, side: this.paneSide() };
        this.host.postMessage(new UnpickMergeCommand(id, scope));
    }

    private padDecisionsOf(id: string): readonly MergePadDecision[] {
        const states = this.states?.states;
        const pickable = states?.pickable.find((entry) => entry.id === id);
        if (states === undefined || pickable === undefined) return [];
        return mergePadDecisions({
            pickable,
            paneSide: this.paneSide(),
            badge: states.badges.find((badge) => badge.id === id),
            takenFromOtherSide: states.marks.takenFromOtherSide.includes(id),
            restoreOffer: states.restoreOffer,
        });
    }

    private decideOnPad(id: string, decision: MergePadDecision): void {
        switch (decision.kind) {
            case "keep":
                this.pick(id, decision.scope, decision.side);
                break;
            case "leaveOut":
                this.pick(id, "element", decision.removedBy);
                break;
            case "keepRemovedFlows":
                this.pick(id, "withConnections", decision.side);
                break;
            case "undo":
                this.unpick(id, decision.scope);
                break;
        }
    }

    /**
     * Shows what the decision this pane sent did, once the host's states
     * answer it: as a card at the element where this canvas draws it, in the
     * shape-less element's menu row otherwise. States that answer no decision
     * of this pane, the partner's included, leave the card as it is.
     */
    private showOutcome(states: MergePaneStates): void {
        const outcome = states.lastOutcome;
        const acted = this.acted;
        if (acted === undefined || !answersActedDecision(outcome, acted)) return;
        this.acted = undefined;
        const nameOf = (id: string) => this.nameOf(id);
        const padBox = this.pickPad?.padBox();
        const content = mergeOutcomeCardContent(
            outcome,
            acted,
            states.restoreOffer,
            nameOf,
            translate,
        );
        const shownAtElement = this.card?.show(content, {
            onSelect: (id) => this.select(id, "card"),
            onKeepRemovedFlows: (id) => this.pick(id, "withConnections"),
            nameOf,
            closeLabel: translate(MERGE_PAD_TEXTS.close),
            ...(padBox === undefined ? {} : { padBox }),
        });
        if (!shownAtElement) {
            this.clearRowOutcome();
            this.rowOutcomeId = acted.elementId;
            this.bar.showShapelessOutcome(acted.elementId, mergeOutcomeLine(content));
        }
    }

    private clearRowOutcome(): void {
        if (this.rowOutcomeId !== undefined) {
            this.bar.showShapelessOutcome(this.rowOutcomeId, undefined);
        }
        this.rowOutcomeId = undefined;
    }

    /** An element the bar or the card names: a step goes there with the partner, anything else only shows here. */
    private select(id: string, origin: StepOrigin = "stepper"): void {
        if (this.allStepIds().includes(id)) {
            this.stepTo(id, origin);
        } else if (this.pane.viewer.focusElement(id)) {
            this.pane.viewer.mirrorSelection(id);
        }
    }

    /**
     * The user selected an element on the canvas: one of the walked list
     * becomes the step, and a selection away from the card's element closes
     * the card.
     */
    private onUserSelected(id: string | undefined): void {
        if (id !== this.card?.shownAt) this.card?.close();
        if (id !== undefined && id !== this.cursorId && this.stepIds().includes(id)) {
            this.stepTo(id, "canvasClick");
        }
    }

    /**
     * The host names an element the same on both panes; this canvas names the
     * rest, an unnamed flow by its ends.
     */
    private nameOf(id: string, endOfFlow = false): string {
        const name = this.states?.states.names[id] ?? this.names?.nameOf(id);
        const ends = endOfFlow ? undefined : this.names?.flowEndsOf(id);
        return mergeElementLabel(
            {
                id,
                ...(name === undefined ? {} : { name }),
                ...(ends === undefined
                    ? {}
                    : {
                          flowEnds: {
                              source: this.nameOf(ends.source, true),
                              target: this.nameOf(ends.target, true),
                          },
                      }),
            },
            translate,
        );
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
    private stepTo(id: string, origin: StepOrigin = "stepper"): void {
        this.goTo(id, origin);
        this.host.postMessage(new CursorChangedCommand(this.allStepIds().indexOf(id)));
        this.shareViewportIfOnlyHereDrawn(id);
    }

    /**
     * The partner draws nothing for a step only this pane draws, so it
     * takes this pane's viewport, after the step: following the step may
     * move it to another plane.
     */
    private shareViewportIfOnlyHereDrawn(id: string): void {
        const step = this.states?.states.allSteps.find((candidate) => candidate.id === id);
        if (
            step?.onThisPane &&
            !step.onOtherPane &&
            !step.shapeless &&
            this.pane.viewer.hasElement(id)
        ) {
            this.host.postMessage(new ViewportChangedCommand(this.pane.viewer.getViewport()));
        }
    }

    /** Zooms in, around the centre, where the pane shows the diagram smaller than {@link STEP_MIN_SCALE}. */
    private zoomInToRead(): void {
        const viewport = this.pane.viewer.getViewport();
        const { clientWidth, clientHeight } = this.canvas;
        if (clientWidth === 0 || clientHeight === 0 || viewport.width <= 0) return;
        if (clientWidth / viewport.width >= STEP_MIN_SCALE) return;
        const width = clientWidth / STEP_MIN_SCALE;
        const height = clientHeight / STEP_MIN_SCALE;
        this.pane.viewer.setViewport({
            x: viewport.x + (viewport.width - width) / 2,
            y: viewport.y + (viewport.height - height) / 2,
            width,
            height,
        });
    }

    /**
     * Shows the step on this pane: a drawn element in the centre, at least
     * at {@link STEP_MIN_SCALE}, and selected, so its context pad opens; a
     * shape-less one by its row in the
     * right pane's menu, which opens at it. On a step only the partner pane
     * draws, this pane keeps its place with nothing selected, since a
     * neighbour here would point elsewhere, but shows the plane the partner
     * stepped into, so their viewports still match, or notes that this
     * version lacks it. A step closes the outcome card, unless the card's own
     * link made it.
     */
    private goTo(id: string, origin: StepOrigin): void {
        this.cursorId = id;
        if (origin !== "card") this.card?.close();
        if (id !== this.rowOutcomeId) this.clearRowOutcome();
        const step = this.states?.states.allSteps.find((candidate) => candidate.id === id);
        if (step?.onThisPane && !step.shapeless && this.pane.viewer.focusElement(id)) {
            this.zoomInToRead();
            this.pane.notePlaneShown(step.plane);
            // A click selected it already; selecting again would reopen its pad.
            if (origin !== "canvasClick") this.pane.viewer.mirrorSelection(id);
        } else {
            this.pane.viewer.clearSelectionMarker();
            this.pane.viewer.mirrorSelection(undefined);
            if (step !== undefined && !step.shapeless) this.pane.followPlane(step.plane);
            if (step?.shapeless && origin !== "restore") this.bar.openMenuAt(id);
        }
        this.updateBar();
    }

    private switchStepList(list: MergeStepList): void {
        this.stepList = list;
        this.updateBar();
        this.host.postMessage(new MergeStepListChangedCommand(list));
    }

    private showAll(): void {
        this.backToWholeDiagram();
        this.host.postMessage(new CursorChangedCommand(SHOW_ALL_CURSOR));
    }

    private backToWholeDiagram(): void {
        this.cursorId = undefined;
        this.card?.close();
        this.clearRowOutcome();
        this.pane.viewer.fitDiagram();
        this.pane.notePlaneShown(undefined);
        this.updateBar();
    }

    private updateBar(): void {
        if (!this.states) return;
        const { states } = this.states;
        const stepIds = this.stepIds();
        this.bar.update({
            caption: states.caption,
            counts: states.counts,
            // The right pane's half carries the stepper and the build, as a diff pane's carries the changes.
            controls:
                this.states.side === "after"
                    ? {
                          canStep: stepIds.length > 0,
                          position: mergeStepPosition(stepIds, this.cursorId),
                          total: stepIds.length,
                          stepList: this.stepList,
                          openConflicts: states.openConflicts,
                          rows: mergeShapelessRows(states),
                          openShapelessConflicts: openShapelessConflicts(states),
                          current: this.cursorId,
                          build: states.build,
                          nameOf: (id) => this.nameOf(id),
                      }
                    : undefined,
        });
    }
}
