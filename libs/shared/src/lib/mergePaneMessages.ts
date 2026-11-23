import type {
    DiffSide,
    MergeBuildNote,
    MergeMarker,
    MergeSide,
    MergeSideCaption,
} from "@miragon/bpmn-modeler-types";

import { Command, Query } from "./messages";

/** One element a merge pane's stepper walks to. */
export interface MergePaneStep {
    readonly id: string;
    /** No canvas draws it: the menu lists it. */
    readonly shapeless: boolean;
    /** The pane's side holds the element, so the pane draws or lists it. */
    readonly onThisPane: boolean;
    /** The other side holds the element, so the partner pane draws or lists it. */
    readonly onOtherPane: boolean;
    /** The sub-process whose plane draws it; absent on the plane a pane opens with. */
    readonly plane?: string;
}

/** Why one side lacks an element the other holds: it removed it from the base, or there is no base version. */
export type MergePaneSideLack = "removed" | "missing";

/** The side that lacks an element the other holds, and why. */
export interface MergePaneLackingSide {
    readonly side: MergeSide;
    readonly lack: MergePaneSideLack;
}

/** How far keeping a container with everything inside reaches: its contents, or every pool with its process. */
export type MergePaneContainerReach = "contents" | "poolProcesses";

/**
 * A shape-less element either side holds and either pane marks, as the
 * pane's menu lists it: its pickable entry with what each side holds; it
 * covers an element the pane's side lacks, which `counts` leaves out.
 */
export interface MergePaneShapelessRow extends MergePanePickable {
    readonly type: string;
    /** The marker as the pane's side names it, also where that side lacks the element. */
    readonly marker: MergeMarker;
    /** Set where current holds the element, with current's name. */
    readonly current?: { readonly name?: string };
    /** Set where incoming holds the element, with incoming's name. */
    readonly incoming?: { readonly name?: string };
    /** The own attributes whose values differ where both sides hold the element; a pick changes none. */
    readonly differences: readonly MergePaneValueDifference[];
    /** More than those attributes differs, such as a child, the parent or the lanes. */
    readonly moreDiffers?: true;
}

/** One own attribute of a shape-less element whose value differs between the sides, as text; a side without it has none. */
export interface MergePaneValueDifference {
    readonly attribute: string;
    readonly current?: string;
    readonly incoming?: string;
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
 * it, or an element the other side removed with the flows and boundary
 * events removed with it.
 * Undo takes back the same reach.
 */
export type MergePickScope = "element" | "withContents" | "withRemoved";

/** The user's pick on an element: the side it keeps, and how far it reaches, which Undo takes back. */
export interface MergePanePick {
    readonly keptSide: MergeSide;
    readonly scope: MergePickScope;
    /** Set while a version merged by hand replaces the kept side's own. */
    readonly mergedByHand?: true;
}

/** A user's pick on a pane that draws the element: kept from this pane's side, or from the other one. */
export interface MergePaneBadge {
    readonly id: string;
    readonly kind: "keptHere" | "replacedHere";
    readonly pick: MergePanePick;
}

/** An element a pick on the pane can keep from either side; naming a side whose version lacks it leaves it out. */
export interface MergePanePickable {
    readonly id: string;
    /** Set where something lies inside it, which a pick can keep with it: how far that reaches. */
    readonly container?: MergePaneContainerReach;
    /**
     * The side the result takes it from where the sides differ, the same on
     * both panes; a side that lacks it leaves it out. Absent while it is open.
     */
    readonly takenSide?: MergeSide;
    /** Set while the user's pick decides it. */
    readonly pick?: MergePanePick;
    /** Set where one side lacks the element, the same on both panes; a pick of that side leaves it out. */
    readonly lackingSide?: MergePaneLackingSide;
    /** Set where its three texts differ, so its XML can be merged by hand: how that merge starts. */
    readonly handMerge?: MergePaneHandMergeStart;
}

/**
 * How a merge of an element's XML by hand starts: on the version the user's
 * pick keeps, or with a pick, where none decides the element yet.
 */
export type MergePaneHandMergeStart = "pickedVersion" | "withPick";

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

/** What the user decided on a pane: kept an element, kept it out from a side that removed it, or took a pick back. */
export type MergePanePickAction = "pick" | "leaveOut" | "unpick";

/** A decision of a pane the merge refused: what the user did, on which element. */
export interface MergePaneRefusedDecision {
    readonly action: MergePanePickAction;
    readonly elementId: string;
}

/** What the user did: a decision on a pane, or a picked element's XML merged by hand. */
export type MergePaneAction = MergePanePickAction | "mergeByHand";

/** A reference whose target is not of the type its property takes. */
export interface MergePaneWrongTypeReference {
    /** Qualified, for example `bpmn:messageRef`. */
    readonly property: string;
    readonly target: string;
    readonly expected: string;
}

/** Why the merge did not take a hand-merged text, as the merge's `HandMergeRefusal` holds it; the pane words it. */
export type MergePaneHandMergeRefusal =
    | { readonly kind: "conflictMarkersLeft" }
    | { readonly kind: "unparsable"; readonly detail: string }
    | { readonly kind: "notOneElement"; readonly found: number }
    | { readonly kind: "typeChanged"; readonly expected: string; readonly found: string }
    | { readonly kind: "idChanged"; readonly expected: string; readonly found?: string }
    /** Each by its id, or by its type when it has none. */
    | { readonly kind: "holdsElementsOfTheirOwn"; readonly ids: readonly string[] }
    | { readonly kind: "beyondOwnAttributes"; readonly properties: readonly string[] }
    | {
          readonly kind: "namesWrongType";
          readonly references: readonly MergePaneWrongTypeReference[];
      }
    | { readonly kind: "unknownNamespace"; readonly namespaces: readonly string[] }
    | { readonly kind: "rejectedByEngine"; readonly detail: string }
    | { readonly kind: "changesStructure"; readonly properties: readonly string[] }
    | { readonly kind: "namesMissingElement"; readonly ids: readonly string[] }
    | { readonly kind: "namesLeftOutElement"; readonly ids: readonly string[] }
    | { readonly kind: "changesOtherDecisions"; readonly ids: readonly string[] }
    | { readonly kind: "notHandMergeable" };

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
          /** A merge by hand's count of the finishes in a row, as on a refused one. */
          readonly finish?: number;
          /** Set on an undo after which the merge would apply the sending pane's last refused decision. */
          readonly freed?: MergePaneRefusedDecision;
      }
    | {
          readonly applied: false;
          readonly action: MergePaneAction;
          readonly elementId: string;
          readonly blockedBy: readonly MergePaneBlock[];
          /** The elements merged by hand the call would move off their side, which it drops only when asked to. */
          readonly handMergesAtStake?: readonly string[];
          /** Set when the merge refused a hand-merged text; the element keeps its version. */
          readonly handMergeRefusal?: MergePaneHandMergeRefusal;
          /** Set when the user closed the element's merge editor without saving: the element is as before the merge, a pick the merge made itself taken back. */
          readonly discarded?: true;
          /** A merge by hand's count of the finishes in a row: a finish that repeats the last one word for word differs from it here. */
          readonly finish?: number;
      };

/** The flows and boundary events the other side removed with an element the user kept, offered on the pane of the kept side. */
export interface MergePaneRestoreOffer {
    readonly elementId: string;
    readonly connections: readonly string[];
    /** Set only when not empty. */
    readonly boundaryEvents?: readonly string[];
    readonly removedBy: MergeSide;
}

/** Whether the merge view can build its result into the working file, and what the last build noted. */
export interface MergePaneBuild {
    readonly canBuild: boolean;
    /** The conflicts still open, which keep Build disabled. */
    readonly openConflicts: number;
    /** A result was built into the working file, so it can be compared with either side. */
    readonly built: boolean;
    /** The notes of the last build; empty before the first. */
    readonly notes: readonly MergeBuildNote[];
}

/** Everything one merge pane shows of its merge view's decisions. */
export interface MergePaneStates {
    readonly caption: MergeSideCaption;
    /** The marker of every element the pane draws, by id. */
    readonly marks: Readonly<Record<MergeMarker, readonly string[]>>;
    /** What the pane's menu lists; `counts` leaves out what the side lacks. */
    readonly shapelessRows: readonly MergePaneShapelessRow[];
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
    /** The drawn elements a pick pulled in or dropped. */
    readonly consequences: readonly string[];
    readonly pickable: readonly MergePanePickable[];
    readonly lastOutcome?: MergePaneOutcome;
    readonly restoreOffer?: MergePaneRestoreOffer;
    /** The names of the elements the pane names in words, the same on both panes; an id without a name is absent. */
    readonly names: Readonly<Record<string, string>>;
    readonly build: MergePaneBuild;
}

/** What the host offers a merge pane besides its decisions. */
export interface MergeHostOffers {
    /** It opens an element's XML changes, as on any BPMN diff pane. */
    readonly elementXmlChanges: boolean;
    /** It opens an element's XML in a merge editor, to merge it by hand. */
    readonly elementXmlMerge: boolean;
}

export const NO_MERGE_HOST_OFFERS: MergeHostOffers = {
    elementXmlChanges: false,
    elementXmlMerge: false,
};

/**
 * Sent from the host to each merge pane once both are ready, and again
 * whenever either reports ready, with the full state of its merge view: a
 * pane that reloaded after a tab switch rebuilds everything from it. A
 * {@link CursorChangedCommand} of a merge pane counts in `allSteps`.
 */
export class ApplyMergeStatesQuery extends Query<"ApplyMergeStatesQuery"> {
    public readonly side: DiffSide;

    public readonly states: MergePaneStates;

    public readonly offers: MergeHostOffers;

    constructor(
        side: DiffSide,
        states: MergePaneStates,
        offers: MergeHostOffers = NO_MERGE_HOST_OFFERS,
    ) {
        super("ApplyMergeStatesQuery");
        this.side = side;
        this.states = states;
        this.offers = offers;
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
 * Sent from a merge pane when the user keeps an element from a side. The
 * host decides it in the merge and sends both panes their states again.
 */
export class PickMergeSideCommand extends Command<"PickMergeSideCommand"> {
    public readonly elementId: string;

    public readonly scope: MergePickScope;

    /**
     * Absent means the sending pane's side. Naming a side whose version lacks
     * the element leaves it out, so one pane can offer both outcomes.
     */
    public readonly side?: MergeSide;

    /** The user agreed to drop the versions merged by hand that the pick moves off their side. */
    public readonly dropsHandMerges?: true;

    /**
     * Merge XML on an element no pick decides yet: where the pick applied,
     * the host opens the element's XML in its merge editor, and takes the
     * pick back if the user closes that editor without saving.
     */
    public readonly mergesXml?: true;

    constructor(
        elementId: string,
        scope: MergePickScope,
        side?: MergeSide,
        { dropsHandMerges, mergesXml }: MergePickOptions = {},
    ) {
        super("PickMergeSideCommand");
        this.elementId = elementId;
        this.scope = scope;
        if (side !== undefined) this.side = side;
        if (dropsHandMerges) this.dropsHandMerges = dropsHandMerges;
        if (mergesXml) this.mergesXml = mergesXml;
    }
}

/** What a {@link PickMergeSideCommand} asks besides the pick. */
export type MergePickOptions = Partial<Pick<PickMergeSideCommand, "dropsHandMerges" | "mergesXml">>;

/**
 * Sent from a merge pane when the user takes a pick back, with the reach the
 * host named for it.
 */
export class UnpickMergeCommand extends Command<"UnpickMergeCommand"> {
    public readonly elementId: string;

    public readonly scope: MergePickScope;

    /** As {@link PickMergeSideCommand.dropsHandMerges}. */
    public readonly dropsHandMerges?: true;

    constructor(elementId: string, scope: MergePickScope, dropsHandMerges?: true) {
        super("UnpickMergeCommand");
        this.elementId = elementId;
        this.scope = scope;
        if (dropsHandMerges) this.dropsHandMerges = dropsHandMerges;
    }
}

/**
 * Sent from a merge pane when the user asks to merge a picked element's XML
 * by hand. The host opens its merge editor on the element, or brings the open
 * one to the front, and answers the finished merge with the panes' states.
 */
export class OpenElementXmlMergeCommand extends Command<"OpenElementXmlMergeCommand"> {
    public readonly elementId: string;

    /** Edit again: start from the text the merge refused last. */
    public readonly resume?: true;

    constructor(elementId = "", resume?: true) {
        super("OpenElementXmlMergeCommand");
        this.elementId = elementId;
        if (resume) this.resume = resume;
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

/** The context pad's decision entries; a keyboard command names each one. */
export const MERGE_PAD_ENTRIES = [
    "keep",
    "keepInside",
    "leaveOut",
    "keepRemovedWith",
    "mergeXml",
    "undo",
] as const;

export type MergePadEntry = (typeof MERGE_PAD_ENTRIES)[number];

/** What a keyboard command asks of the focused merge pane: a pad entry on its selection, a step of ‹ ›, or Build. */
export const MERGE_PANE_COMMANDS = [...MERGE_PAD_ENTRIES, "next", "previous", "build"] as const;

export type MergePaneCommand = (typeof MERGE_PANE_COMMANDS)[number];

/**
 * Sent from a merge pane whenever the keyboard commands it can run change,
 * as its selection or its states do. The host offers only those, and only
 * while the pane has the focus.
 */
export class MergePaneCommandsChangedCommand extends Command<"MergePaneCommandsChangedCommand"> {
    public readonly available: readonly MergePaneCommand[];

    constructor(available: readonly MergePaneCommand[] = []) {
        super("MergePaneCommandsChangedCommand");
        this.available = available;
    }
}

/**
 * Sent from the host to the focused merge pane when the user runs one of its
 * keyboard commands. The pane runs it as the pad, ‹ › or Build does, so the
 * keyboard reaches what the mouse reaches; Build is posted even while
 * conflicts are open, so the host's refusal answers it.
 */
export class RunMergePaneCommandQuery extends Query<"RunMergePaneCommandQuery"> {
    public readonly command: MergePaneCommand;

    constructor(command: MergePaneCommand = "next") {
        super("RunMergePaneCommandQuery");
        this.command = command;
    }
}
