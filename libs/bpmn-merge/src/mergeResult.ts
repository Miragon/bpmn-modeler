export type MergeSide = "current" | "incoming";

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

export type ConflictState =
    | "bothChanged"
    | "bothAdded"
    | "removedAndChanged"
    | "changedAndRemoved"
    /** Without a base: only one side has the element. */
    | "onlyInCurrent"
    | "onlyInIncoming"
    /** Without a base: both sides have the element, differently. */
    | "differs";

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

export interface MergeResult {
    readonly hasBase: boolean;
    /** Current's document order, then the elements only incoming has, then those only base has. */
    readonly elements: readonly MergeElement[];
}

const CONFLICT_STATES: ReadonlySet<ElementState> = new Set<ConflictState>([
    "bothChanged",
    "bothAdded",
    "removedAndChanged",
    "changedAndRemoved",
    "onlyInCurrent",
    "onlyInIncoming",
    "differs",
]);

export function isConflictState(state: ElementState): state is ConflictState {
    return CONFLICT_STATES.has(state);
}
