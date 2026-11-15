import {
    type ApplyMergeStatesQuery,
    CursorChangedCommand,
    type MergePaneStates,
    type MergePaneStep,
    type ProtocolMessage,
    SHOW_ALL_CURSOR,
} from "@miragon/bpmn-modeler-shared";
import { i18n } from "@miragon/bpmn-modeler-i18n";

import { type MergeStepList, mergeStepPosition, nextMergeStep } from "../../domain/mergeStepper";
import { MERGE_LEGEND_TEXTS, type MergeTranslate, mergeCaptionText } from "../../domain/mergeTexts";
import type { DiffPaneChannel } from "../../port/hostChannel";
import { DiffPanePlumbing } from "./diffPanePlumbing";
import { MergeLegend } from "./mergeLegend";
import { createMergeMarksModule, type MergeMarks } from "./mergeMarks";

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
 *     in `allSteps`, which both panes share whichever list each walks.
 *
 * The stepper keeps its own cursor by element id: a decided conflict leaves
 * the open list, and the step after it goes on from its place.
 */
export class MergeMode {
    private readonly pane: DiffPanePlumbing;

    private readonly legend: MergeLegend;

    private marks: MergeMarks | undefined;

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
        ]);
        this.legend = new MergeLegend(
            legendParent,
            {
                onPrevious: () => this.step(-1),
                onNext: () => this.step(1),
                onShowAll: () => this.showAll(),
                onStepList: (list) => this.switchStepList(list),
                onShapeless: (id) => this.stepTo(id),
            },
            i18n,
        );
        this.legend.reserveRoomOn(document.body);
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
                    if (id !== undefined) this.goTo(id);
                }
                break;
        }
    }

    private paint(query: ApplyMergeStatesQuery): void {
        this.states = query;
        this.pane.tagSide(query.side);
        this.pane.offerElementXmlChanges(query.elementXmlChanges);
        this.paintMarks();
        this.pane.label(query.side, () => mergeCaptionText(query.states.caption, translate));
        this.updateLegend();
    }

    private paintMarks(): void {
        if (this.states) {
            this.marks?.paint(
                this.states.states.marks,
                translate(MERGE_LEGEND_TEXTS.conflictBadge),
            );
        }
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
    private stepTo(id: string): void {
        this.goTo(id);
        this.host.postMessage(new CursorChangedCommand(this.allStepIds().indexOf(id)));
    }

    /**
     * Shows the step on this pane: a drawn element in the centre, a shape-less
     * one by its legend entry. An element only the partner pane holds leaves
     * this pane where it is, since a neighbour here would point elsewhere.
     */
    private goTo(id: string): void {
        this.cursorId = id;
        this.pane.setPlaneMissing(false);
        const step = this.states?.states.allSteps.find((candidate) => candidate.id === id);
        const drawnHere = step !== undefined && step.onThisPane && !step.shapeless;
        if (!(drawnHere && this.pane.viewer.focusElement(id))) {
            this.pane.viewer.clearSelectionMarker();
        }
        this.updateLegend();
    }

    private switchStepList(list: MergeStepList): void {
        this.stepList = list;
        this.updateLegend();
    }

    private showAll(): void {
        this.backToWholeDiagram();
        this.host.postMessage(new CursorChangedCommand(SHOW_ALL_CURSOR));
    }

    private backToWholeDiagram(): void {
        this.cursorId = undefined;
        this.pane.viewer.fitDiagram();
        this.pane.setPlaneMissing(false);
        this.updateLegend();
    }

    private updateLegend(): void {
        if (!this.states) return;
        const { states } = this.states;
        this.legend.update({
            counts: states.counts,
            canStep: this.stepIds().length > 0,
            position: mergeStepPosition(this.stepIds(), this.cursorId),
            openConflicts: states.openConflicts,
            stepList: this.stepList,
            shapeless: states.shapeless,
            current: this.cursorId,
        });
    }
}
