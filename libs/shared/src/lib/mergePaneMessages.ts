import type { DiffSide, MergeMarker, MergeSideCaption } from "@miragon/bpmn-modeler-types";

import { Command, Query } from "./messages";

/** One element a merge pane's stepper walks to. */
export interface MergePaneStep {
    readonly id: string;
    /** No canvas draws it: the pane's legend lists it. */
    readonly shapeless: boolean;
    /** The pane's side holds the element, so the pane draws or lists it. */
    readonly onThisPane: boolean;
    /** The sub-process whose plane draws it; absent on the plane a pane opens with. */
    readonly plane?: string;
}

/** A marked element no canvas draws, which the pane lists instead. */
export interface MergePaneShapelessMark {
    readonly id: string;
    readonly type: string;
    readonly marker: MergeMarker;
}

/** Which list a merge pane's Next and Previous walk: the open conflicts, or every element either pane marks. */
export type MergePaneStepList = "openConflicts" | "all";

/** Where the steppers of a merge view's tab are, which the host keeps for its two panes. */
export interface MergePaneStepping {
    readonly list: MergePaneStepList;
    /** The element both steppers are on; absent before the first step and after Show all. */
    readonly cursor?: string;
}

/** Everything one merge pane shows of its merge view's decisions. */
export interface MergePaneStates {
    readonly caption: MergeSideCaption;
    /** The marker of every element the pane draws, by id. */
    readonly marks: Readonly<Record<MergeMarker, readonly string[]>>;
    readonly shapeless: readonly MergePaneShapelessMark[];
    /** Per marker, the elements the pane marks and those it lists. */
    readonly counts: Readonly<Record<MergeMarker, number>>;
    /** The open conflicts in navigation order, the same on both panes. */
    readonly openConflictSteps: readonly MergePaneStep[];
    /** Every element either pane marks, in navigation order, the same on both panes. */
    readonly allSteps: readonly MergePaneStep[];
    readonly openConflicts: number;
    readonly stepping: MergePaneStepping;
}

/**
 * Sent from the host to each merge pane once both are ready, and again
 * whenever either reports ready, with the full state of its merge view: a
 * pane that reloaded after a tab switch rebuilds everything from it. A
 * {@link CursorChangedCommand} of a merge pane counts in `allSteps`.
 */
export class ApplyMergeStatesQuery extends Query<"ApplyMergeStatesQuery"> {
    public readonly side: DiffSide;

    public readonly states: MergePaneStates;

    /** Whether the host opens an element's XML changes, as on any BPMN diff pane. */
    public readonly elementXmlChanges: boolean;

    constructor(side: DiffSide, states: MergePaneStates, elementXmlChanges = false) {
        super("ApplyMergeStatesQuery");
        this.side = side;
        this.states = states;
        this.elementXmlChanges = elementXmlChanges;
    }
}

/**
 * Sent from a merge pane when the user switches the list Next and Previous
 * walk. The host keeps the list for the tab and sends both panes their
 * states again, so the partner walks the same list.
 */
export class MergeStepListChangedCommand extends Command<"MergeStepListChangedCommand"> {
    public readonly list: MergePaneStepList;

    constructor(list: MergePaneStepList) {
        super("MergeStepListChangedCommand");
        this.list = list;
    }
}
