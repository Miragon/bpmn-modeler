import type { MergeResolution } from "./mergeDecisions";
import { drawingContainersOf, poolsByProcess } from "./mergeDecisionsLayout";
import {
    type LayoutState,
    MERGE_SIDES,
    type MergeElement,
    type MergeResult,
    type MergeSide,
    chosenVersionOf,
} from "./mergeResult";
import { isEdgeEnd } from "./referenceRules";
import {
    type RestoredFlowDefault,
    connectionsOn,
    keptAgainstRemoval,
    removedWith,
} from "./removedWith";

export type BuildNote =
    | {
          /** A flow and the shapes it misses at its ends or runs through, or a shape and the containers it lies outside. */
          readonly kind: "flowEndOffShape" | "flowThroughShape" | "shapeOutsideContainer";
          readonly id: string;
          readonly shapes: readonly string[];
      }
    | { readonly kind: "shapesOverlap"; readonly ids: readonly string[] }
    | { readonly kind: "boundaryEventOffHost"; readonly id: string; readonly host: string }
    | { readonly kind: "lanesOverlap"; readonly ids: readonly string[] }
    | {
          readonly kind: "restoredWithoutRemovedWith";
          readonly id: string;
          readonly connections: readonly string[];
          /** The boundary events the other side removed with the element that the result leaves out. */
          readonly boundaryEvents?: readonly string[];
      }
    | {
          readonly kind: "defaultFlowNotRestored";
          readonly id: string;
          readonly flow: string;
          /** The default the source keeps instead; none when it keeps no default. */
          readonly keptDefault?: string;
      }
    | {
          readonly kind: "layoutChangedByBoth";
          readonly ids: readonly string[];
          readonly keptSide: MergeSide;
      }
    | { readonly kind: "frameDiffers"; readonly attribute: string };

/**
 * A drawn flow's ends, when the flow and its ends are drawn from both sides
 * together: each side may have moved one end without routing the flow.
 */
function endsDrawnApartOf(
    element: MergeElement,
    resolution: MergeResolution,
    drawnFrom: (id: string) => MergeSide | undefined,
): string[] | undefined {
    const version = chosenVersionOf(element, (id) => resolution.elements[id]);
    if (!version || resolution.layout[element.id] === undefined) return undefined;
    const ends = [...new Set(version.references.filter(isEdgeEnd).map(({ target }) => target))];
    const sides = new Set([element.id, ...ends].map(drawnFrom));
    return MERGE_SIDES.every((side) => sides.has(side)) ? ends : undefined;
}

/**
 * An element kept against the other side's removal, while the boundary events
 * the other side removed with it, or flows that connect it or them on its own
 * side, stay out: each is decided on its own, so what was removed with the
 * element stays removed unless kept with it (`pickWithRemoved`).
 */
export function restoredWithoutRemovedWithNotes(
    result: MergeResult,
    resolution: MergeResolution,
): BuildNote[] {
    const leftOut = (candidates: readonly MergeElement[]) =>
        candidates.filter((candidate) => !isInResultOf(candidate, resolution));
    return result.elements.flatMap((element): BuildNote[] => {
        const side = resolution.elements[element.id];
        if (side === undefined || !keptAgainstRemoval(element, side)) return [];
        const boundaryEvents = leftOut(removedWith(result.elements, element, side).boundaryEvents);
        const connected = [element, ...boundaryEvents].flatMap((end) =>
            connectionsOn(result.elements, end.id, side),
        );
        const connections = leftOut([...new Set(connected)]).map(({ id }) => id);
        if (connections.length === 0 && boundaryEvents.length === 0) return [];
        const note = { kind: "restoredWithoutRemovedWith", id: element.id, connections } as const;
        return [
            boundaryEvents.length === 0
                ? note
                : { ...note, boundaryEvents: boundaryEvents.map(({ id }) => id) },
        ];
    });
}

function isInResultOf(element: MergeElement, resolution: MergeResolution): boolean {
    return chosenVersionOf(element, (id) => resolution.elements[id]) !== undefined;
}

/** A flow kept against its removal that its source in the result does not name as its default. */
export function defaultFlowNotRestoredNotes(
    flowDefaults: readonly RestoredFlowDefault[],
    restored: ReadonlyMap<string, string>,
): BuildNote[] {
    return flowDefaults.flatMap((flowDefault): BuildNote[] => {
        const note = {
            kind: "defaultFlowNotRestored",
            id: flowDefault.source,
            flow: flowDefault.flow,
        } as const;
        if (flowDefault.kind === "otherDefaultKept") {
            return [{ ...note, keptDefault: flowDefault.keptDefault }];
        }
        return restored.get(flowDefault.source) === flowDefault.flow ? [] : [note];
    });
}

/**
 * Elements the base and both sides draw, each side apart from the base and from the other: the
 * result keeps one side's drawing. Members linked through a host, a parent, the pool drawing a
 * parent process or a flow's end form one group, split by the side the result draws them from.
 * A note lists only a part's outermost members, as a container stands for its contents and an
 * end for its flows. A flow drawn from another side than one of its ends is left out: when each
 * side moved one end, its waypoints differ on both sides without either side routing it, and
 * `layoutSpotNotes` names it if it no longer meets an end. Lanes link nothing: one can hold most
 * of a diagram.
 * Without a base nothing is noted, as every element the sides draw differently counts as
 * changed by both.
 */
export function layoutChangedByBothNotes(
    result: MergeResult,
    resolution: MergeResolution,
    layoutOf: (id: string, side: MergeSide) => string | undefined,
): BuildNote[] {
    const drawnFrom = drawnFromOf(result, resolution);
    const keptSides = new Map<string, MergeSide>();
    for (const element of result.elements) {
        const keptSide = resolution.layout[element.id];
        if (
            keptSide !== undefined &&
            changedApartByBoth(element, layoutOf) &&
            !endsDrawnApartOf(element, resolution, drawnFrom)
        ) {
            keptSides.set(element.id, keptSide);
        }
    }
    const links = memberLinksOf(result, resolution, keptSides);
    const groupOf = groupsOf(links);
    const parts = new Map<string, { readonly keptSide: MergeSide; readonly ids: string[] }>();
    for (const [id, keptSide] of keptSides) {
        const key = `${groupOf(id)} ${keptSide}`;
        const part = parts.get(key) ?? { keptSide, ids: [] };
        part.ids.push(id);
        parts.set(key, part);
    }
    return [...parts.values()].map(({ keptSide, ids }): BuildNote => {
        const inPart = new Set(ids);
        const outermost = ids.filter((id) => !links.get(id)?.some((link) => inPart.has(link)));
        return { kind: "layoutChangedByBoth", ids: outermost, keptSide };
    });
}

function changedApartByBoth(
    { id, layout, versions }: MergeElement,
    layoutOf: (id: string, side: MergeSide) => string | undefined,
): boolean {
    return (
        layout === "bothChanged" &&
        versions.base?.drawn === true &&
        versions.current?.drawn === true &&
        versions.incoming?.drawn === true &&
        layoutOf(id, "current") !== layoutOf(id, "incoming")
    );
}

/** Each member's containers and flow ends that are members too. */
function memberLinksOf(
    result: MergeResult,
    resolution: MergeResolution,
    members: ReadonlyMap<string, MergeSide>,
): ReadonlyMap<string, readonly string[]> {
    const sideInResult = (id: string) => resolution.elements[id];
    const pools = poolsByProcess(result.elements, sideInResult);
    const links = new Map<string, readonly string[]>();
    for (const element of result.elements) {
        if (!members.has(element.id)) continue;
        const version = chosenVersionOf(element, sideInResult);
        const containers = drawingContainersOf(version, pools)
            .filter(({ kind }) => kind !== "lane")
            .map(({ id }) => id);
        const ends = (version?.references ?? []).filter(isEdgeEnd).map(({ target }) => target);
        links.set(
            element.id,
            [...containers, ...ends].filter((id) => members.has(id)),
        );
    }
    return links;
}

/** The connected sets of `links`, each named by one of its ids. */
function groupsOf(links: ReadonlyMap<string, readonly string[]>): (id: string) => string {
    const representatives = new Map<string, string>([...links.keys()].map((id) => [id, id]));
    const groupOf = (id: string): string => {
        const representative = representatives.get(id) ?? id;
        if (representative === id) return id;
        const group = groupOf(representative);
        representatives.set(id, group);
        return group;
    };
    for (const [id, linked] of links) {
        for (const other of linked) representatives.set(groupOf(other), groupOf(id));
    }
    return groupOf;
}

/** The side an element of the result is drawn from, undefined when both sides draw it alike or it is not drawn. */
function drawnFromOf(
    result: MergeResult,
    resolution: MergeResolution,
): (id: string) => MergeSide | undefined {
    const layoutsById = new Map<string, LayoutState>(
        result.elements.map(({ id, layout }) => [id, layout]),
    );
    return (id) => (layoutsById.get(id) === "unchanged" ? undefined : resolution.layout[id]);
}
