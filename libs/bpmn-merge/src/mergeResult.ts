import { type MergeSide, otherSide } from "@miragon/bpmn-modeler-types/mergeVocabulary";

export {
    MERGE_SIDES,
    otherSide,
    type MergeSide,
} from "@miragon/bpmn-modeler-types/mergeVocabulary";

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

/** How the sides changed the layout of several elements together. */
export function combinedLayoutOf(layouts: readonly LayoutState[]): LayoutState {
    const changedBy = (side: LayoutState) =>
        layouts.some((layout) => layout === side || layout === "bothChanged");
    const byCurrent = changedBy("takenFromCurrent");
    const byIncoming = changedBy("takenFromIncoming");
    if (byCurrent && byIncoming) return "bothChanged";
    if (byCurrent) return "takenFromCurrent";
    return byIncoming ? "takenFromIncoming" : "unchanged";
}

/** Current's layout unless only incoming changed it; where both changed it, the leader's, current's without one. */
export function preferredLayoutSideOf(layout: LayoutState, leader?: MergeSide): MergeSide {
    if (layout === "bothChanged") return leader ?? "current";
    return layout === "takenFromIncoming" ? "incoming" : "current";
}

/**
 * The side that re-laid out the diagram: it moved more than half of the shapes the base and both sides draw, and
 * more of them than the other side. A colour, a label or a flow is no move. None without a base, as nothing tells who
 * moved what.
 */
export function layoutLeaderOf(elements: readonly MergeElement[]): MergeSide | undefined {
    const shapes = elements.filter(
        ({ moved, versions }) =>
            moved !== undefined &&
            [versions.base, versions.current, versions.incoming].every((version) => version?.drawn),
    );
    const movedBy = (side: MergeSide) =>
        shapes.filter(({ moved }) => moved === "bothChanged" || moved === LAYOUT_TAKEN_FROM[side])
            .length;
    const [byCurrent, byIncoming] = [movedBy("current"), movedBy("incoming")];
    const leads = (moved: number, other: number) => moved * 2 > shapes.length && moved > other;
    if (leads(byIncoming, byCurrent)) return "incoming";
    return leads(byCurrent, byIncoming) ? "current" : undefined;
}

const LAYOUT_TAKEN_FROM: Record<MergeSide, LayoutState> = {
    current: "takenFromCurrent",
    incoming: "takenFromIncoming",
};

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
    /**
     * The version draws the element: with a shape, an edge or a plane of its own, or, for a process
     * no pool names, with a drawing of something it holds on a collaboration's plane.
     */
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
    /** How the sides moved or resized the element's shapes, apart from labels and colours; absent unless the base and both sides draw it with shapes. */
    readonly moved?: LayoutState;
    readonly versions: {
        readonly base?: ElementVersion;
        readonly current?: ElementVersion;
        readonly incoming?: ElementVersion;
    };
}

/** Only `side` holds the element and no base version exists, so nobody knows whether the other side removed it or never had it. */
export function addedOnlyBy(element: MergeElement, side: MergeSide): boolean {
    const { versions } = element;
    return (
        versions.base === undefined &&
        versions[side] !== undefined &&
        versions[otherSide(side)] === undefined
    );
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

export function isLane(element: MergeElement): boolean {
    return element.type === "bpmn:Lane";
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
