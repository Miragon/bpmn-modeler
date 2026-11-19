import {
    type ElementReference,
    type ElementVersion,
    type LayoutState,
    type MergeElement,
    type MergeSide,
    type SideInResult,
    chosenVersionOf,
    combinedLayoutOf,
    otherSide,
    sameLanes,
} from "./mergeResult";
import { isEdgeEnd, isHostReference, isProcessReference } from "./referenceRules";

/** Current's layout unless only incoming changed it. */
const PREFERRED_LAYOUT_SIDE: Record<LayoutState, MergeSide> = {
    unchanged: "current",
    takenFromCurrent: "current",
    bothChanged: "current",
    takenFromIncoming: "incoming",
};

const LANE_TYPE = "bpmn:Lane";

/** References whose targets fix where an element is drawn: an edge's ends, a boundary event's host. */
function isPlacingReference(reference: ElementReference): boolean {
    return isEdgeEnd(reference) || isHostReference(reference);
}

/** A host holds its boundary event on its border; a parent (or the pool of a process) decides the plane; a lane neither. */
type ContainerKind = "host" | "parent" | "lane";

interface LayoutChoice {
    readonly side: MergeSide;
    readonly preferred: MergeSide;
}

export interface ResultLayout {
    /** Every drawn element of the result with the side whose DI it takes. */
    readonly sides: Record<string, MergeSide>;
    /** The lanes drawn from another side than the rest of their pool's lanes, in the result's order. */
    readonly appendedLanes: readonly string[];
}

/** A pool and the lanes of its process, which prefer one side together. */
interface LaneBlock {
    readonly pool: string;
    readonly lanes: readonly string[];
    readonly side: MergeSide;
}

/**
 * The side whose DI each drawn element of the result takes. A pool and its lanes prefer one side together, so the
 * lanes stay stacked as that side drew them; a lane that side does not draw in place is appended. Containers settle
 * first: an element follows the side of its host, parent (or the pool drawing its process) or lane when that side
 * moved the container, or draws the element on another plane, and draws the element in place. A flow whose end had
 * to leave its preferred side is drawn from its ends' side when they agree, so its waypoints meet their shapes.
 */
export function layoutSidesOf(
    elements: readonly MergeElement[],
    sideInResult: SideInResult,
): ResultLayout {
    const elementsById = new Map(elements.map((element) => [element.id, element]));
    const poolOfProcess = poolsByProcess(elements, sideInResult);
    const blocks = laneBlocksOf(elementsById, sideInResult, poolOfProcess);
    const blockSides = new Map(
        blocks.flatMap(({ pool, lanes, side }) =>
            [pool, ...lanes].map((id) => [id, side] as const),
        ),
    );
    const choices = new Map<string, LayoutChoice>();
    for (const element of elements) {
        const side = sideInResult(element.id);
        const preferred = blockSides.get(element.id) ?? PREFERRED_LAYOUT_SIDE[element.layout];
        const choice =
            side === undefined
                ? undefined
                : layoutChoiceOf(element, side, preferred, poolOfProcess.has(element.id));
        if (choice !== undefined) {
            choices.set(element.id, choice);
        }
    }
    const settled = settleContainersFirst(elementsById, choices, sideInResult, poolOfProcess);
    const sides: Record<string, MergeSide> = {};
    for (const element of elements) {
        const side = settled.get(element.id);
        if (side !== undefined) {
            sides[element.id] = edgeSideFromEnds(element, sideInResult, choices, settled) ?? side;
        }
    }
    const appended = new Set(
        blocks.flatMap(({ lanes, side }) => lanes.filter((id) => sides[id] !== side)),
    );
    return { sides, appendedLanes: elements.map(({ id }) => id).filter((id) => appended.has(id)) };
}

/**
 * The lanes of each process a pool of the result draws, with the side they prefer together: current's, unless only
 * incoming changed the pool or one of its lanes, as for a single element.
 */
function laneBlocksOf(
    elementsById: ReadonlyMap<string, MergeElement>,
    sideInResult: SideInResult,
    poolOfProcess: ReadonlyMap<string, string>,
): LaneBlock[] {
    const lanesByPool = new Map<string, MergeElement[]>();
    for (const element of elementsById.values()) {
        if (element.type !== LANE_TYPE || chosenVersionOf(element, sideInResult) === undefined) {
            continue;
        }
        const root = laneSetOwnerOf(element, elementsById, sideInResult);
        const pool = root === undefined ? undefined : poolOfProcess.get(root);
        if (pool !== undefined) lanesByPool.set(pool, [...(lanesByPool.get(pool) ?? []), element]);
    }
    return [...lanesByPool].map(([pool, lanes]) => {
        const poolElement = elementsById.get(pool);
        const members = poolElement === undefined ? lanes : [poolElement, ...lanes];
        return {
            pool,
            lanes: lanes.map(({ id }) => id),
            side: PREFERRED_LAYOUT_SIDE[combinedLayoutOf(members.map(({ layout }) => layout))],
        };
    });
}

/** The process or sub-process whose lane set holds the lane, through its parent lanes. */
function laneSetOwnerOf(
    lane: MergeElement,
    elementsById: ReadonlyMap<string, MergeElement>,
    sideInResult: SideInResult,
): string | undefined {
    const seen = new Set<string>();
    let element: MergeElement | undefined = lane;
    while (element?.type === LANE_TYPE && !seen.has(element.id)) {
        seen.add(element.id);
        const parent = chosenVersionOf(element, sideInResult)?.parent;
        if (parent === undefined) return undefined;
        element = elementsById.get(parent);
        if (element?.type !== LANE_TYPE) return parent;
    }
    return undefined;
}

/**
 * The preferred side, else the element's own, else the other one: the first that draws it in place. The other one
 * draws a process whose side drew it only through a pool the result drops; a process a pool of the result draws
 * takes no plane of its own from it.
 */
function layoutChoiceOf(
    element: MergeElement,
    elementSide: MergeSide,
    preferred: MergeSide,
    drawnByAPoolOfTheResult: boolean,
): LayoutChoice | undefined {
    const contentVersion = element.versions[elementSide];
    const candidates = drawnByAPoolOfTheResult
        ? [preferred, elementSide]
        : [preferred, elementSide, otherSide(preferred)];
    const side = candidates.find((candidate) =>
        drawsInPlace(element.versions[candidate], contentVersion),
    );
    return side === undefined ? undefined : { side, preferred };
}

function settleContainersFirst(
    elementsById: ReadonlyMap<string, MergeElement>,
    choices: ReadonlyMap<string, LayoutChoice>,
    sideInResult: SideInResult,
    poolOfProcess: ReadonlyMap<string, string>,
): ReadonlyMap<string, MergeSide> {
    const settled = new Map<string, MergeSide>();
    const visiting = new Set<string>();

    const settle = (id: string): MergeSide | undefined => {
        const known = settled.get(id);
        const choice = choices.get(id);
        if (known !== undefined || choice === undefined || visiting.has(id)) {
            return known ?? choice?.side;
        }
        visiting.add(id);
        const element = elementsById.get(id) as MergeElement;
        const contentVersion = chosenVersionOf(element, sideInResult);
        let side = choice.side;
        for (const { id: containerId, kind } of drawingContainersOf(
            contentVersion,
            poolOfProcess,
        )) {
            const containerSide = settle(containerId);
            const container = elementsById.get(containerId) as MergeElement;
            if (
                containerSide !== undefined &&
                containerSide !== side &&
                followsContainer(
                    { element, side, contentVersion },
                    { container, side: containerSide, kind },
                )
            ) {
                side = containerSide;
                break;
            }
        }
        visiting.delete(id);
        settled.set(id, side);
        return side;
    };

    for (const id of elementsById.keys()) {
        settle(id);
    }
    return settled;
}

/**
 * Any move of a host counts. A parent, pool or lane moved by one side moved its contents with it there, which then
 * changed on both sides; a container the other side only resized leaves a child's own move alone. A parent whose side
 * draws the child on another plane, as a collapsed sub-process does, always counts.
 */
function followsContainer(
    drawn: {
        readonly element: MergeElement;
        readonly side: MergeSide;
        readonly contentVersion: ElementVersion | undefined;
    },
    by: {
        readonly container: MergeElement;
        readonly side: MergeSide;
        readonly kind: ContainerKind;
    },
): boolean {
    const { element, side, contentVersion } = drawn;
    const containerSideVersion = element.versions[by.side];
    if (!drawsInPlace(containerSideVersion, contentVersion)) {
        return false;
    }
    if (by.kind === "parent" && element.versions[side]?.plane !== containerSideVersion?.plane) {
        return true;
    }
    const containerMoved = by.container.layout !== "unchanged";
    return by.kind === "host" ? containerMoved : containerMoved && element.layout === "bothChanged";
}

/** Host first, then the parent or, for a process, the pool drawing it, then the lanes. */
export function drawingContainersOf(
    version: ElementVersion | undefined,
    poolOfProcess: ReadonlyMap<string, string>,
): { readonly id: string; readonly kind: ContainerKind }[] {
    if (version === undefined) {
        return [];
    }
    const hosts = targetsOf(version.references, isHostReference);
    const parents =
        version.parent === undefined
            ? []
            : [version.parent, poolOfProcess.get(version.parent)].filter(
                  (id): id is string => id !== undefined,
              );
    return [
        ...hosts.map((id) => ({ id, kind: "host" as const })),
        ...parents.map((id) => ({ id, kind: "parent" as const })),
        ...version.lanes.map((id) => ({ id, kind: "lane" as const })),
    ];
}

/** The pool of the result that draws each process, by the process. */
export function poolsByProcess(
    elements: readonly MergeElement[],
    sideInResult: SideInResult,
): ReadonlyMap<string, string> {
    const pools = new Map<string, string>();
    for (const element of elements) {
        const version = chosenVersionOf(element, sideInResult);
        for (const process of targetsOf(version?.references ?? [], isProcessReference)) {
            pools.set(process, element.id);
        }
    }
    return pools;
}

function edgeSideFromEnds(
    element: MergeElement,
    sideInResult: SideInResult,
    choices: ReadonlyMap<string, LayoutChoice>,
    settled: ReadonlyMap<string, MergeSide>,
): MergeSide | undefined {
    const contentVersion = chosenVersionOf(element, sideInResult);
    const ends = targetsOf(contentVersion?.references ?? [], isEdgeEnd).map((end) => ({
        side: settled.get(end),
        leftPreferred: settled.get(end) !== choices.get(end)?.preferred,
    }));
    if (ends.length === 0 || !ends.some((end) => end.leftPreferred)) {
        return undefined;
    }
    const endSide = ends[0]?.side;
    const agree = endSide !== undefined && ends.every((end) => end.side === endSide);
    return agree && drawsInPlace(element.versions[endSide], contentVersion) ? endSide : undefined;
}

/** Drawn, in the same parent and lanes, and against the same edge ends and host as the version the result takes. */
function drawsInPlace(
    layoutVersion: ElementVersion | undefined,
    contentVersion: ElementVersion | undefined,
): boolean {
    if (!layoutVersion?.drawn) {
        return false;
    }
    if (contentVersion === undefined) {
        return true;
    }
    return (
        layoutVersion.parent === contentVersion.parent &&
        sameLanes(layoutVersion.lanes, contentVersion.lanes) &&
        samePlacingReferences(layoutVersion.references, contentVersion.references)
    );
}

function samePlacingReferences(
    left: readonly ElementReference[],
    right: readonly ElementReference[],
): boolean {
    const placing = (references: readonly ElementReference[]) =>
        references
            .filter(isPlacingReference)
            .map(({ property, target, targetPart }) => `${property} ${target} ${targetPart ?? ""}`);
    return sameInOrder(placing(left), placing(right));
}

function sameInOrder(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every((id, index) => id === right[index]);
}

function targetsOf(
    references: readonly ElementReference[],
    isWanted: (reference: ElementReference) => boolean,
): string[] {
    return references.filter(isWanted).map(({ target }) => target);
}
