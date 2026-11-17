import {
    type ApplyMergeStatesQuery,
    BuildMergeResultCommand,
    CompareMergeResultCommand,
    CursorChangedCommand,
    type MergePaneStates,
    type MergePaneStep,
    MergeStepListChangedCommand,
    type ProtocolMessage,
    SHOW_ALL_CURSOR,
    ViewportChangedCommand,
} from "@miragon/bpmn-modeler-shared";
import { i18n } from "@miragon/bpmn-modeler-i18n";

import { actedInMenu, actedOnPad } from "../../domain/mergeActedDecision";
import { openShapelessConflicts } from "../../domain/mergeMenuRows";
import { decidesInMenu, mergePadDecisions } from "../../domain/mergePadDecisions";
import { type MergeStepList, mergeStepPosition, nextMergeStep } from "../../domain/mergeStepper";
import { MERGE_MARK_TEXTS, type MergeTranslate, pickBadgeText } from "../../domain/mergeTexts";
import type { DiffPaneChannel } from "../../port/hostChannel";
import { DiffPanePlumbing } from "./diffPanePlumbing";
import { MergeBar, type MergeBarControls } from "./mergeBar";
import { createMergeElementNamesModule, type MergeElementNames } from "./mergeElementNames";
import { createMergeMarksModule, type MergeMarks } from "./mergeMarks";
import { createMergeOutcomeCardModule } from "./mergeOutcomeCard";
import { MergeOutcomes } from "./mergeOutcomes";
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
 * the markers the host sends ({@link MergeMarks}), counts them in a one-line
 * {@link MergeBar} with the pane's caption and, on the right pane, steps
 * through the host's step lists:
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
 *     from the context pad's decisions, and from the right pane's menu rows
 *     for the elements no canvas draws; the host decides them and sends both
 *     panes their states again, so the pane shows a pick only once the host
 *     made it. The pane that sent it shows what it did
 *     ({@link MergeOutcomes}); the partner shows none.
 *   - Outgoing {@link ViewportChangedCommand} after a step only this pane
 *     draws, so the partner shows the same part of the diagram.
 *   - Outgoing {@link BuildMergeResultCommand} and
 *     {@link CompareMergeResultCommand} from the right pane's bar; the
 *     host builds, and its states say whether Build and the comparisons are
 *     enabled and what the last build noted.
 *
 * The stepper keeps its own cursor by element id: a decided conflict leaves
 * the open list, and the step after it goes on from its place. A step
 * selects its element, so diagram-js opens the context pad where it lands,
 * and a click on an element of the merge makes it the step. A step onto an
 * element no canvas draws opens the right pane's menu at its row.
 */
export class MergeMode {
    private readonly pane: DiffPanePlumbing;

    private readonly bar: MergeBar;

    private marks: MergeMarks | undefined;

    private names: MergeElementNames | undefined;

    private pickPad: MergePickContextPadProvider | undefined;

    private readonly outcomes: MergeOutcomes;

    private states: ApplyMergeStatesQuery | undefined;

    private stepList: MergeStepList = "openConflicts";

    private cursorId: string | undefined;

    constructor(
        canvas: HTMLElement,
        legendParent: HTMLElement,
        private readonly host: DiffPaneChannel,
    ) {
        this.outcomes = new MergeOutcomes({
            post: (command) => host.postMessage(command),
            nameOf: (id) => this.nameOf(id),
            select: (id) => this.select(id, { keepCard: true }),
            translate,
        });
        this.pane = new DiffPanePlumbing(canvas, host, [
            createMergeMarksModule({ attach: (marks) => (this.marks = marks) }),
            createMergeElementNamesModule({ attach: (names) => (this.names = names) }),
            createMergePickModule({
                decisionsOf: (id) => (this.states ? mergePadDecisions(this.states.states, id) : []),
                decide: (id, decision) => this.outcomes.send(actedOnPad(id, decision)),
                attach: (pad) => (this.pickPad = pad),
            }),
            createMergeOutcomeCardModule({ attach: (card) => this.outcomes.attachCard(card) }),
        ]);
        this.bar = new MergeBar(
            legendParent,
            {
                onPrevious: () => this.step(-1),
                onNext: () => this.step(1),
                onShowAll: () => this.showAll(),
                onStepList: (list) => this.switchStepList(list),
                onShapeless: (id) => this.stepTo(id),
                onDecide: (id, decision) => this.outcomes.send(actedInMenu(id, decision)),
                onSelect: (id) => this.select(id),
                onBuild: () => this.host.postMessage(new BuildMergeResultCommand()),
                onCompare: (against) =>
                    this.host.postMessage(new CompareMergeResultCommand(against)),
                onXmlChanges: (id) => this.pane.showElementXmlChanges(id),
            },
            i18n,
        );
        this.bar.reserveRoomOn(document.body);
        this.pane.onPlaneMissingChanged((missing) => this.bar.showPlaneMissing(missing));
        this.pane.viewer.onSelectedElementChanged((id) => this.onUserSelected(id));
        i18n.onChange(() => {
            this.paintMarks();
            this.outcomes.rewrite();
            this.updateBar();
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
                    if (id !== undefined) this.goTo(id, { shareViewport: true, openMenu: true });
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
        const answer = this.outcomes.receive(query.states);
        const kept = query.states.stepping.cursor;
        // A pane that reloaded has no step of its own; the host kept the tab's, without opening the menu.
        if (this.cursorId === undefined && kept !== undefined && this.allStepIds().includes(kept)) {
            this.goTo(kept, { shareViewport: false, openMenu: false });
        } else {
            this.updateBar();
        }
        const rowSaid = this.outcomes.settle(answer);
        if (rowSaid !== undefined) this.bar.announceRowOutcome(rowSaid);
    }

    private paintMarks(): void {
        if (!this.states) return;
        const { marks, badges, consequences } = this.states.states;
        this.marks?.paint(
            { marks, badges, consequences },
            {
                conflict: translate(MERGE_MARK_TEXTS.conflictBadge),
                badge: (badge) => pickBadgeText(badge, translate),
            },
        );
    }

    /** A user's click on an element of the merge the user can pick makes it the step. */
    private onUserSelected(id: string | undefined): void {
        this.outcomes.follow(id);
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
     * An element a note or the card names: a step goes there with the
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
        this.goTo(id, { shareViewport: false, openMenu: true, keepCard });
        this.host.postMessage(new CursorChangedCommand(this.allStepIds().indexOf(id)));
        this.shareViewportOnStepOnlyHere(id);
    }

    /**
     * Shows the step on this pane: a drawn element in the centre at the
     * current zoom, selected, so its context pad opens; a shape-less one by
     * its row in the right pane's menu, which a step opens there and a step
     * onto a drawn element closes again. The element's plane is entered
     * first, since a selection holds only on the plane shown. On a step only
     * the partner pane draws, or one without a shape, the pane clears its
     * selection; it keeps its place, since a neighbour here would point
     * elsewhere, but shows the plane the partner stepped into, so their
     * viewports still match, or notes that this version lacks it.
     */
    private goTo(
        id: string,
        {
            shareViewport,
            openMenu,
            keepCard = false,
        }: {
            readonly shareViewport: boolean;
            readonly openMenu: boolean;
            readonly keepCard?: boolean;
        },
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
        if (!keepCard) this.outcomes.follow(selected);
        this.updateBar();
        if (step !== undefined && decidesInMenu(step)) {
            if (openMenu) this.bar.openMenuAt(id);
        } else {
            this.bar.closeMenuOpenedByStep();
        }
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
        this.updateBar();
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
        this.updateBar();
    }

    private updateBar(): void {
        if (!this.states) return;
        const { side, states } = this.states;
        const { caption, counts } = states;
        // The right pane's bar carries the stepping and the build, as a diff pane's carries the changes.
        if (side !== "after") {
            this.bar.update({ caption, counts });
            return;
        }
        this.bar.update({
            caption,
            counts,
            controls: this.controls(states, this.outcomes.menuRows(this.states.elementXmlChanges)),
        });
    }

    private controls(states: MergePaneStates, rows: MergeBarControls["rows"]): MergeBarControls {
        const position = mergeStepPosition(this.stepIds(), this.allStepIds(), this.cursorId);
        return {
            canStep: this.stepIds().length > 0,
            ...(position === undefined ? {} : { position }),
            total: this.stepIds().length,
            openConflicts: states.openConflicts,
            stepList: this.stepList,
            rows,
            shapelessConflicts: openShapelessConflicts(states.shapelessRows),
            ...(this.cursorId === undefined ? {} : { current: this.cursorId }),
            build: states.build,
            nameOf: (id) => this.nameOf(id),
        };
    }
}
