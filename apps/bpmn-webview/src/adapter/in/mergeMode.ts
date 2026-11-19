import {
    type ApplyMergeStatesQuery,
    BuildMergeResultCommand,
    CompareMergeResultCommand,
    CursorChangedCommand,
    DiffSelectionChangedCommand,
    type MergePaneStates,
    type MergePaneStep,
    MergeStepListChangedCommand,
    type ProtocolMessage,
    SHOW_ALL_CURSOR,
    ViewportChangedCommand,
} from "@miragon/bpmn-modeler-shared";
import { i18n } from "@miragon/bpmn-modeler-i18n";

import { type DiffStepLanding, diffStepSelection } from "../../domain/diffStepSelection";
import { actedInMenu, actedOnPad } from "../../domain/mergeActedDecision";
import { openShapelessConflicts } from "../../domain/mergeMenuRows";
import {
    decidesInMenu,
    type MergePadDecision,
    mergePadDecisions,
} from "../../domain/mergePadDecisions";
import { type MergeStepList, mergeStepPosition, nextMergeStep } from "../../domain/mergeStepper";
import { MERGE_MARK_TEXTS, type MergeTranslate, pickBadgeText } from "../../domain/mergeTexts";
import type { DiffPaneChannel } from "../../port/hostChannel";
import { DiffPanePlumbing } from "./diffPanePlumbing";
import { MergeBar, type MergeBarControls } from "./mergeBar";
import { createMergeElementNamesModule, type MergeElementNames } from "./mergeElementNames";
import { createMergeMarksModule, type MergeMarks } from "./mergeMarks";
import { createMergeOutcomeCardModule } from "./mergeOutcomeCard";
import { MergeOutcomes } from "./mergeOutcomes";
import { MergePaneKeyboard, type MergeSelectedPad } from "./mergePaneKeyboard";
import { createMergePickModule, type MergePickContextPadProvider } from "./mergePickContextPad";

const STEPS_OF: Readonly<
    Record<MergeStepList, (states: MergePaneStates) => readonly MergePaneStep[]>
> = {
    openConflicts: (states) => states.openConflictSteps,
    all: (states) => states.allSteps,
};

const translate: MergeTranslate = (key, replacements) => i18n.translate(key, replacements);

/** How the pane came to a step: its own user stepped or clicked, or it follows the partner or the host. */
type MergeStepLanding = "stepped" | "clicked" | "followed";

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
 *   - Outgoing {@link DiffSelectionChangedCommand} after a user step onto
 *     an element with a shape, also one only the partner draws, so an open
 *     element XML diff follows the step as it follows a click.
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
 *   - Outgoing {@link MergePaneCommandsChangedCommand} whenever what its
 *     keyboard commands can do changes, and incoming
 *     `RunMergePaneCommandQuery` → run one as the pad's entry on the
 *     selected element, ‹ › or Build does, moving no focus
 *     ({@link MergePaneKeyboard}).
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

    private readonly keyboard: MergePaneKeyboard;

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
        this.keyboard = new MergePaneKeyboard({
            post: (command) => host.postMessage(command),
            step: (direction) => this.step(direction),
            build: () => host.postMessage(new BuildMergeResultCommand()),
            selectedPad: () => this.selectedPad(),
            decide: (id, decision) => this.outcomes.send(actedOnPad(id, decision)),
        });
        this.pane = new DiffPanePlumbing(canvas, host, [
            createMergeMarksModule({ attach: (marks) => (this.marks = marks) }),
            createMergeElementNamesModule({ attach: (names) => (this.names = names) }),
            createMergePickModule({
                decisionsOf: (id) => this.padDecisionsOf(id),
                decide: (id, decision) => this.outcomes.send(actedOnPad(id, decision)),
                attach: (pad) => (this.pickPad = pad),
                selectionChanged: () => this.reportCommands(),
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
                    if (id !== undefined) {
                        this.goTo(id, { landing: "followed", shareViewport: true, openMenu: true });
                    }
                }
                break;
            case "RunMergePaneCommandQuery":
                this.keyboard.run(query.command);
                break;
        }
    }

    private reportCommands(): void {
        if (this.states) this.keyboard.report({ canStep: this.canStep() });
    }

    private selectedPad(): MergeSelectedPad {
        const id = this.pickPad?.selectedElementId();
        return id === undefined ? { decisions: [] } : { id, decisions: this.padDecisionsOf(id) };
    }

    private padDecisionsOf(id: string): readonly MergePadDecision[] {
        return this.states ? mergePadDecisions(this.states.states, id) : [];
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
            this.goTo(kept, { landing: "followed", shareViewport: false, openMenu: false });
        } else {
            this.updateBar();
        }
        const rowSaid = this.outcomes.settle(answer);
        if (rowSaid !== undefined) this.bar.announceRowOutcome(rowSaid);
        this.reportCommands();
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
            this.stepTo(id, { clicked: true });
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

    /** Whether ‹ › have a step, for the bar's buttons and the keys alike. */
    private canStep(): boolean {
        return this.stepIds().length > 0;
    }

    private allStepIds(): readonly string[] {
        return this.states?.states.allSteps.map(({ id }) => id) ?? [];
    }

    private step(direction: 1 | -1): void {
        const id = nextMergeStep(this.stepIds(), this.allStepIds(), this.cursorId, direction);
        if (id !== undefined) this.stepTo(id);
    }

    /**
     * A user's step: moves there and takes the partner pane along. It reports
     * an element with a shape as the selection, so an open XML diff follows;
     * a click reported its own already.
     */
    private stepTo(
        id: string,
        {
            keepCard = false,
            clicked = false,
        }: { readonly keepCard?: boolean; readonly clicked?: boolean } = {},
    ): void {
        this.goTo(id, {
            landing: clicked ? "clicked" : "stepped",
            shareViewport: false,
            openMenu: true,
            keepCard,
        });
        this.host.postMessage(new CursorChangedCommand(this.allStepIds().indexOf(id)));
        if (!clicked && this.stepOf(id)?.shapeless === false) {
            this.host.postMessage(new DiffSelectionChangedCommand(id));
        }
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
     * viewports still match, or notes that this version lacks it. A click's
     * own selection stands; a step's is kept in view as {@link selectStepped}
     * decides.
     */
    private goTo(
        id: string,
        {
            landing,
            shareViewport,
            openMenu,
            keepCard = false,
        }: {
            readonly landing: MergeStepLanding;
            readonly shareViewport: boolean;
            readonly openMenu: boolean;
            readonly keepCard?: boolean;
        },
    ): void {
        this.cursorId = id;
        const step = this.stepOf(id);
        const drawnHere =
            step !== undefined &&
            step.onThisPane &&
            !step.shapeless &&
            this.pane.viewer.focusElement(id);
        if (drawnHere) {
            this.pane.notePlaneShown(step.plane);
        } else {
            this.pane.viewer.clearSelectionMarker();
            if (step !== undefined && !step.shapeless) this.pane.followPlane(step.plane);
        }
        if (landing !== "clicked") {
            this.selectStepped(id, {
                steppedHere: landing === "stepped",
                drawnHere,
                onlyThisSideHasIt: step !== undefined && step.onThisPane && !step.onOtherPane,
            });
        }
        if (!keepCard) this.outcomes.follow(drawnHere ? id : undefined);
        this.updateBar();
        if (step !== undefined && decidesInMenu(step)) {
            if (openMenu) this.bar.openMenuAt(id);
        } else {
            this.bar.closeMenuOpenedByStep();
        }
        if (shareViewport) this.shareViewportOnStepOnlyHere(id);
    }

    private selectStepped(id: string, landing: DiffStepLanding): void {
        const selection = diffStepSelection(landing);
        if (selection.kind === "select") {
            this.pane.viewer.selectStep(id, { keepInView: selection.keepsInView });
        } else {
            this.pane.viewer.selectStep(undefined, { keepInView: false });
        }
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
        this.reportCommands();
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
            canStep: this.canStep(),
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
