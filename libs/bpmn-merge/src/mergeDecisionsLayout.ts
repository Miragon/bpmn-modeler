import type { ElementReference, ElementVersion, MergeElement, MergeSide } from "./mergeResult";

const EDGE_END_PROPERTIES = ["#sourceRef", "#targetRef"] as const;

const HOST_PROPERTY = "#attachedToRef";

/** References whose targets fix where an element is drawn: an edge's ends, a boundary event's host. */
const PLACING_PROPERTIES: readonly string[] = [...EDGE_END_PROPERTIES, HOST_PROPERTY];

const PROCESS_PROPERTY = "#processRef";

type SideInResult = (id: string) => MergeSide | undefined;

/** A host holds its boundary event on its border; a parent (or the pool of a process) decides the plane; a lane neither. */
type ContainerKind = "host" | "parent" | "lane";

interface LayoutChoice {
    readonly side: MergeSide;
    /** Current's layout unless only incoming changed it. */
    readonly preferred: MergeSide;
}

/**
 * The side whose DI each drawn element of the result takes. Containers settle first: an element follows the side of
 * its host, parent (or the pool drawing its process) or lane when that side moved the container, or draws the element
 * on another plane, and draws the element in place. A flow whose end had to leave its preferred side is drawn from its
 * ends' side when they agree, so its waypoints meet their shapes.
 */
export function layoutSidesOf(
    elements: readonly MergeElement[],
    sideInResult: SideInResult,
): Record<string, MergeSide> {
    const elementsById = new Map(elements.map((element) => [element.id, element]));
    const choices = new Map<string, LayoutChoice>();
    for (const element of elements) {
        const side = sideInResult(element.id);
        const choice = side === undefined ? undefined : layoutChoiceOf(element, side);
        if (choice !== undefined) {
            choices.set(element.id, choice);
        }
    }
    const settled = settleContainersFirst(elements, elementsById, choices, sideInResult);
    const layout: Record<string, MergeSide> = {};
    for (const element of elements) {
        const side = settled.get(element.id);
        if (side !== undefined) {
            layout[element.id] = edgeSideFromEnds(element, sideInResult, choices, settled) ?? side;
        }
    }
    return layout;
}

/** The preferred side, or the element's own when the preferred one does not draw it in place. */
function layoutChoiceOf(element: MergeElement, elementSide: MergeSide): LayoutChoice | undefined {
    const preferred: MergeSide = element.layout === "takenFromIncoming" ? "incoming" : "current";
    const keepsPreferred = drawsInPlace(element.versions[preferred], element.versions[elementSide]);
    const side = keepsPreferred ? preferred : elementSide;
    if (!element.versions[side]?.drawn) {
        return undefined;
    }
    return { side, preferred };
}

function settleContainersFirst(
    elements: readonly MergeElement[],
    elementsById: ReadonlyMap<string, MergeElement>,
    choices: ReadonlyMap<string, LayoutChoice>,
    sideInResult: SideInResult,
): ReadonlyMap<string, MergeSide> {
    const poolOfProcess = poolsByProcess(elements, sideInResult);
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
        const contentVersion = element.versions[sideInResult(id) as MergeSide];
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

    for (const element of elements) {
        settle(element.id);
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
function drawingContainersOf(
    version: ElementVersion | undefined,
    poolOfProcess: ReadonlyMap<string, string>,
): { readonly id: string; readonly kind: ContainerKind }[] {
    if (version === undefined) {
        return [];
    }
    const hosts = targetsOf(version.references, [HOST_PROPERTY]);
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

function poolsByProcess(
    elements: readonly MergeElement[],
    sideInResult: SideInResult,
): ReadonlyMap<string, string> {
    const pools = new Map<string, string>();
    for (const element of elements) {
        const side = sideInResult(element.id);
        const version = side === undefined ? undefined : element.versions[side];
        for (const process of targetsOf(version?.references ?? [], [PROCESS_PROPERTY])) {
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
    const contentVersion = element.versions[sideInResult(element.id) as MergeSide];
    const ends = targetsOf(contentVersion?.references ?? [], EDGE_END_PROPERTIES).map((end) => ({
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
        sameIds(layoutVersion.lanes, contentVersion.lanes) &&
        samePlacingReferences(layoutVersion.references, contentVersion.references)
    );
}

function samePlacingReferences(
    left: readonly ElementReference[],
    right: readonly ElementReference[],
): boolean {
    const placing = (references: readonly ElementReference[]) =>
        references
            .filter(({ property }) =>
                PLACING_PROPERTIES.some((suffix) => property.endsWith(suffix)),
            )
            .map(({ property, target, targetPart }) => `${property} ${target} ${targetPart ?? ""}`);
    return sameIds(placing(left), placing(right));
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every((id, index) => id === right[index]);
}

function targetsOf(references: readonly ElementReference[], suffixes: readonly string[]): string[] {
    return references
        .filter(({ property }) => suffixes.some((suffix) => property.endsWith(suffix)))
        .map(({ target }) => target);
}
