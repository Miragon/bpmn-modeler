import type { DiffSide, MergeMarker, MergeSideCaption } from "@miragon/bpmn-modeler-types";

import { Query } from "./messages";

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
