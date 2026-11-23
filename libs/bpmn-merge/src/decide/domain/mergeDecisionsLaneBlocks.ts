import {
    type ElementVersion,
    type MergeElement,
    type MergeSide,
    type SideInResult,
    MERGE_SIDES,
    chosenVersionOf,
    combinedLayoutOf,
    isLane,
    otherSide,
    preferredLayoutSideOf,
} from "../../kernel/domain/mergeResult";

/** A pool and the lanes of its process, which prefer one side together. */
export interface LaneBlock {
    readonly pool: string;
    readonly lanes: readonly string[];
    readonly side: MergeSide;
}

/**
 * The lanes of each process a pool of the result draws, with the side they prefer together: current's, unless only
 * incoming changed the pool or one of its lanes, as for a single element, or both did and incoming leads the layout. A side that draws a lane of the process the
 * result leaves out would leave its band empty, so the other side draws them when it draws none.
 */
export function laneBlocksOf(
    elementsById: ReadonlyMap<string, MergeElement>,
    sideInResult: SideInResult,
    poolOfProcess: ReadonlyMap<string, string>,
    leader: MergeSide | undefined,
): LaneBlock[] {
    const lanesByPool = new Map<string, MergeElement[]>();
    const leftOut: Record<MergeSide, Set<string>> = { current: new Set(), incoming: new Set() };
    for (const element of elementsById.values()) {
        if (!isLane(element)) continue;
        const inResult = chosenVersionOf(element, sideInResult);
        if (inResult === undefined) {
            for (const side of MERGE_SIDES) {
                const owner = laneSetOwnerOf(element, elementsById, (lane) => lane.versions[side]);
                if (element.versions[side]?.drawn && owner !== undefined) {
                    leftOut[side].add(owner);
                }
            }
            continue;
        }
        const owner = laneSetOwnerOf(element, elementsById, (lane) =>
            chosenVersionOf(lane, sideInResult),
        );
        const pool = owner === undefined ? undefined : poolOfProcess.get(owner);
        if (pool !== undefined) lanesByPool.set(pool, [...(lanesByPool.get(pool) ?? []), element]);
    }
    const processOf = new Map([...poolOfProcess].map(([process, pool]) => [pool, process]));
    return [...lanesByPool].map(([pool, lanes]) => {
        const poolElement = elementsById.get(pool);
        const members = poolElement === undefined ? lanes : [poolElement, ...lanes];
        const preferred = preferredLayoutSideOf(
            combinedLayoutOf(members.map(({ layout }) => layout)),
            leader,
        );
        const leavesOut = (side: MergeSide) => leftOut[side].has(processOf.get(pool) ?? "");
        const side =
            leavesOut(preferred) && !leavesOut(otherSide(preferred))
                ? otherSide(preferred)
                : preferred;
        return { pool, lanes: lanes.map(({ id }) => id), side };
    });
}

/** The process or sub-process whose lane set holds the lane in the versions given, through its parent lanes. */
function laneSetOwnerOf(
    lane: MergeElement,
    elementsById: ReadonlyMap<string, MergeElement>,
    versionOf: (lane: MergeElement) => ElementVersion | undefined,
): string | undefined {
    const seen = new Set<string>();
    let element: MergeElement | undefined = lane;
    while (element !== undefined && isLane(element) && !seen.has(element.id)) {
        seen.add(element.id);
        const parent = versionOf(element)?.parent;
        if (parent === undefined) return undefined;
        element = elementsById.get(parent);
        if (element === undefined || !isLane(element)) return parent;
    }
    return undefined;
}
