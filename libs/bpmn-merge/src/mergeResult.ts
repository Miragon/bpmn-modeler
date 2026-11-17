import type { MergeSide } from "@miragon/bpmn-modeler-types/mergeVocabulary";

export { MERGE_SIDES, type MergeSide } from "@miragon/bpmn-modeler-types/mergeVocabulary";

const OTHER_SIDE: Readonly<Record<MergeSide, MergeSide>> = {
    current: "incoming",
    incoming: "current",
};

/** The side a merge side is merged with. */
export function otherSide(side: MergeSide): MergeSide {
    return OTHER_SIDE[side];
}

export type ResolvedState =
    | "unchanged"
    | "takenFromCurrent"
    | "takenFromIncoming"
    | "sameChange"
    | "addedByCurrent"
    | "addedByIncoming"
    | "sameAddition"
    | "removedByCurrent"
    | "removedByIncoming"
    | "removedByBoth";

const CONFLICT_STATES = [
    "bothChanged",
    "bothAdded",
    "removedAndChanged",
    "changedAndRemoved",
    // Without a base: only one side has the element.
    "onlyInCurrent",
    "onlyInIncoming",
    // Without a base: both sides have the element, differently.
    "differs",
] as const;

export type ConflictState = (typeof CONFLICT_STATES)[number];

export type ElementState = ResolvedState | ConflictState;

/** Bounds, waypoints, labels and DI attributes, classified apart from the content. */
export type LayoutState = "unchanged" | "takenFromCurrent" | "takenFromIncoming" | "bothChanged";

export interface ElementReference {
    /** Owning type and property, for example `bpmn:SequenceFlow#sourceRef`. */
    readonly property: string;
    /** The merge element that holds the target. */
    readonly target: string;
    /** The referenced object's own id when it lies inside `target`, for example a data input of a task. */
    readonly targetPart?: string;
}

export interface ElementVersion {
    /** The nearest enclosing merge element: sub-process, process, participant, collaboration or lane; none for root elements. */
    readonly parent?: string;
    /** The object of the parent that holds the element, such as a lane set, when it is not the parent itself. */
    readonly container?: string;
    /** Every lane whose `flowNodeRef` lists the element, outermost first. */
    readonly lanes: readonly string[];
    readonly references: readonly ElementReference[];
    /** Ids inside the element that are no merge elements of their own: data inputs, properties, lane sets, event definitions. */
    readonly parts: readonly string[];
    readonly drawn: boolean;
    /** The element whose plane draws the element's shape or edge. */
    readonly plane?: string;
}

/**
 * Lanes are listed outermost first, so the same lanes in another order are
 * another nesting: two versions are in the same lanes only in the same order.
 */
export function lanesKeyOf(lanes: readonly string[]): string {
    return lanes.join(" ");
}

export function sameLanes(left: readonly string[], right: readonly string[]): boolean {
    return lanesKeyOf(left) === lanesKeyOf(right);
}

export interface MergeElement {
    readonly id: string;
    readonly type: string;
    readonly state: ElementState;
    readonly layout: LayoutState;
    readonly versions: {
        readonly base?: ElementVersion;
        readonly current?: ElementVersion;
        readonly incoming?: ElementVersion;
    };
}

/** `versionKeyOf` each version's XML: equal keys mean the result was computed from these texts. */
export interface VersionKeys {
    readonly base?: string;
    readonly current: string;
    readonly incoming: string;
}

/** The side each element of the result is taken from; undefined while it is open. */
export type SideInResult = (id: string) => MergeSide | undefined;

/** The version of the element the result takes: the one on its side, none while it is open or absent there. */
export function chosenVersionOf(
    element: MergeElement,
    sideInResult: SideInResult,
): ElementVersion | undefined {
    const side = sideInResult(element.id);
    return side === undefined ? undefined : element.versions[side];
}

export interface MergeResult {
    readonly hasBase: boolean;
    readonly versionKeys: VersionKeys;
    /** Current's document order, then the elements only incoming has, then those only base has. */
    readonly elements: readonly MergeElement[];
}

const CONFLICT_STATE_SET: ReadonlySet<ElementState> = new Set(CONFLICT_STATES);

export function isConflictState(state: ElementState): state is ConflictState {
    return CONFLICT_STATE_SET.has(state);
}
