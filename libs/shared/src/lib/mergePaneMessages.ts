import type {
    DiffSide,
    MergeMarker,
    MergeSide,
    MergeSideCaption,
} from "@miragon/bpmn-modeler-types";

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

/**
 * How far a pick reaches: the element, the element with everything inside
 * it, or an element the other side removed with the flows removed with it.
 * Undo takes back the same reach.
 */
export type MergePickScope = "element" | "withContents" | "withConnections";

/** A user's pick on a pane that draws the element: kept from this pane's side, or from the other one. */
export interface MergePaneBadge {
    readonly id: string;
    readonly kind: "keptHere" | "replacedHere";
    readonly keptSide: MergeSide;
    readonly scope: MergePickScope;
}

/** A user's pick the pane cannot draw, which its legend lists under the user's picks. */
export interface MergePanePickNotDrawn {
    readonly id: string;
    readonly keptSide: MergeSide;
    readonly scope: MergePickScope;
}

/** An element a pick on the pane keeps from its side, or keeps out where the side removed it. */
export interface MergePanePickable {
    readonly id: string;
    /** Something lies inside it, which a pick can keep with it. */
    readonly container: boolean;
    /** Set while the user's pick decides it: what Undo takes back. */
    readonly undo?: MergePickScope;
}

/** Why a pick was refused, as the merge names it. */
export type MergeObstacleKind =
    | "targetInNoVersion"
    | "targetPickedWithout"
    | "targetDroppedByThisPick"
    | "targetTakenByThisPickWithoutPart"
    | "sideLacksTarget"
    | "targetNotInResult"
    | "targetTakenWithoutPart"
    | "dependentPicked"
    | "dependentPulledInByThisPick"
    | "idHeldByAnother"
    | "processInAnotherCollaboration";

/** The obstacles that tell whether the element misses the whole target or only a part inside it. */
export type MergeObstacleWithMissing = "targetPickedWithout" | "sideLacksTarget";

/** One reason a pick was refused: the element it would have to change, and the element that element needs. */
export type MergePaneBlock =
    | {
          readonly elementId: string;
          readonly targetId: string;
          readonly obstacle: MergeObstacleWithMissing;
          readonly missing: "target" | "part";
      }
    | {
          readonly elementId: string;
          readonly targetId: string;
          readonly obstacle: Exclude<MergeObstacleKind, MergeObstacleWithMissing>;
      };

/** What the user did: kept an element, kept it out from a side that removed it, or took a pick back. */
export type MergePaneAction = "pick" | "leaveOut" | "unpick";

/** What the user's last pick or undo did, on both panes of the merge view. */
export type MergePaneOutcome =
    | {
          readonly applied: true;
          readonly action: MergePaneAction;
          readonly elementId: string;
          readonly pulledIn: readonly string[];
          readonly dropped: readonly string[];
          /** Decided before, open again after it. */
          readonly reopened: readonly string[];
      }
    | {
          readonly applied: false;
          readonly action: MergePaneAction;
          readonly elementId: string;
          readonly blockedBy: readonly MergePaneBlock[];
      };

/** The flows the other side removed with an element the user kept, offered on the pane that kept it. */
export interface MergePaneRestoreOffer {
    readonly elementId: string;
    readonly connections: readonly string[];
    readonly removedBy: MergeSide;
}

/**
 * Something the last build asks the user to look at, as the merge library's
 * `BuildNote` names it: a flow whose ends are drawn from different sides, two
 * elements the sides added at the same place, an element drawn apart from its
 * container, an element kept without the flows removed with it, or a part
 * of the file's `definitions` that differs between the sides, of which the
 * result keeps current's.
 */
export type MergePaneBuildNote =
    | {
          readonly kind: "flowEndsFromDifferentSides";
          readonly id: string;
          readonly ends: readonly string[];
      }
    | { readonly kind: "addedAtSamePlace"; readonly ids: readonly string[] }
    | {
          readonly kind: "drawnApartFromContainer";
          readonly id: string;
          readonly containers: readonly string[];
      }
    | {
          readonly kind: "restoredWithoutConnections";
          readonly id: string;
          readonly connections: readonly string[];
      }
    | { readonly kind: "frameDiffers"; readonly attribute: string };

/** Whether the merge view can build its result into the working file, and what the last build noted. */
export interface MergePaneBuild {
    readonly canBuild: boolean;
    /** The conflicts still open, which keep Build disabled. */
    readonly openConflicts: number;
    /** A result was built into the working file, so it can be compared with either side. */
    readonly built: boolean;
    /** The notes of the last build; empty before the first. */
    readonly notes: readonly MergePaneBuildNote[];
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
    /** The user's picks the pane draws, in result order. */
    readonly badges: readonly MergePaneBadge[];
    readonly picksNotDrawn: readonly MergePanePickNotDrawn[];
    /** The drawn elements a pick pulled in or dropped. */
    readonly consequences: readonly string[];
    readonly pickable: readonly MergePanePickable[];
    readonly lastOutcome?: MergePaneOutcome;
    readonly restoreOffer?: MergePaneRestoreOffer;
    /** The names of the elements the legend names, the same on both panes; an id without a name is absent. */
    readonly names: Readonly<Record<string, string>>;
    readonly build: MergePaneBuild;
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

/**
 * Sent from a merge pane when the user keeps an element from the pane's
 * side. The host decides it in the merge and sends both panes their states
 * again.
 */
export class PickMergeSideCommand extends Command<"PickMergeSideCommand"> {
    public readonly elementId: string;

    public readonly scope: MergePickScope;

    constructor(elementId: string, scope: MergePickScope) {
        super("PickMergeSideCommand");
        this.elementId = elementId;
        this.scope = scope;
    }
}

/**
 * Sent from a merge pane when the user takes a pick back, with the reach the
 * host named for it.
 */
export class UnpickMergeCommand extends Command<"UnpickMergeCommand"> {
    public readonly elementId: string;

    public readonly scope: MergePickScope;

    constructor(elementId: string, scope: MergePickScope) {
        super("UnpickMergeCommand");
        this.elementId = elementId;
        this.scope = scope;
    }
}

/**
 * Sent from a merge pane when the user presses Build. The host builds the
 * merge result into the working file, never staging it, and opens the file.
 */
export class BuildMergeResultCommand extends Command<"BuildMergeResultCommand"> {
    constructor() {
        super("BuildMergeResultCommand");
    }
}

/**
 * Sent from a merge pane when the user compares the built result with one
 * side. The host opens a plain BPMN diff of that side against the working
 * file as it is open, unsaved edits included.
 */
export class CompareMergeResultCommand extends Command<"CompareMergeResultCommand"> {
    public readonly against: MergeSide;

    constructor(against: MergeSide = "incoming") {
        super("CompareMergeResultCommand");
        this.against = against;
    }
}

/**
 * Sent from a pane of a merge result comparison when the user switches it to
 * the other side. The host replaces the comparison with one against that side.
 */
export class SwitchMergeComparisonCommand extends Command<"SwitchMergeComparisonCommand"> {
    constructor() {
        super("SwitchMergeComparisonCommand");
    }
}
