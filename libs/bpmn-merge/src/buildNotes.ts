import type { DiagramBounds } from "./diagramIndex";
import type { MergeResolution } from "./mergeDecisions";
import {
    type LayoutState,
    MERGE_SIDES,
    type MergeElement,
    type MergeResult,
    type MergeSide,
    addedOnlyBy,
    chosenVersionOf,
} from "./mergeResult";
import { isEdgeEnd } from "./referenceRules";
import { connectionsOn, keptAgainstRemoval } from "./removedConnections";

export type BuildNote =
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

/**
 * A drawn flow whose waypoints were drawn on one side while an end's shape
 * comes from the other: its waypoints may no longer meet that shape. A layout
 * both sides share counts for neither.
 */
export function flowEndsNotes(result: MergeResult, resolution: MergeResolution): BuildNote[] {
    const drawnFrom = drawnFromOf(result, resolution);
    const notes: BuildNote[] = [];
    for (const element of result.elements) {
        const version = chosenVersionOf(element, (id) => resolution.elements[id]);
        if (!version || resolution.layout[element.id] === undefined) continue;
        const ends = [...new Set(version.references.filter(isEdgeEnd).map(({ target }) => target))];
        const sides = new Set([element.id, ...ends].map(drawnFrom));
        if (MERGE_SIDES.every((side) => sides.has(side))) {
            notes.push({ kind: "flowEndsFromDifferentSides", id: element.id, ends });
        }
    }
    return notes;
}

/** Elements only one side has, one from each side, whose shapes overlap. */
export function addedAtSamePlaceNotes(
    result: MergeResult,
    resolution: MergeResolution,
    boundsOf: (id: string, side: MergeSide) => DiagramBounds | undefined,
): BuildNote[] {
    const addedBounds = (side: MergeSide) =>
        result.elements.flatMap((element) => {
            const onlyThisSide =
                addedOnlyBy(element, side) && resolution.elements[element.id] === side;
            const bounds = onlyThisSide ? boundsOf(element.id, side) : undefined;
            return bounds ? [{ id: element.id, bounds }] : [];
        });
    const addedByIncoming = addedBounds("incoming");
    return addedBounds("current").flatMap((current) =>
        addedByIncoming
            .filter((incoming) => overlap(current.bounds, incoming.bounds))
            .map((incoming): BuildNote => ({
                kind: "addedAtSamePlace",
                ids: [current.id, incoming.id],
            })),
    );
}

/**
 * An element drawn from another side than a container that encloses it, a
 * sub-process or a lane: its shape may lie outside that container's, or on
 * another plane than its siblings. A layout both sides share counts for
 * neither.
 */
export function drawnApartFromContainerNotes(
    result: MergeResult,
    resolution: MergeResolution,
    isEnclosingContainer: (id: string) => boolean,
): BuildNote[] {
    const drawnFrom = drawnFromOf(result, resolution);
    return result.elements.flatMap((element): BuildNote[] => {
        const version = chosenVersionOf(element, (id) => resolution.elements[id]);
        const side = drawnFrom(element.id);
        if (!version || side === undefined) return [];
        const containers = [
            ...(version.parent === undefined ? [] : [version.parent]),
            ...version.lanes,
        ].filter((container) => {
            const containerSide = drawnFrom(container);
            return (
                isEnclosingContainer(container) &&
                containerSide !== undefined &&
                containerSide !== side
            );
        });
        return containers.length === 0
            ? []
            : [{ kind: "drawnApartFromContainer", id: element.id, containers }];
    });
}

/**
 * An element kept against the other side's removal, while flows that connect
 * it on its own side stay out: each flow is decided on its own, so the flows
 * removed with the element stay removed, unless kept with it
 * (`pickWithConnections`), and it may be left unconnected.
 */
export function restoredWithoutConnectionsNotes(
    result: MergeResult,
    resolution: MergeResolution,
): BuildNote[] {
    const isInResult = (element: MergeElement) =>
        chosenVersionOf(element, (id) => resolution.elements[id]) !== undefined;
    return result.elements.flatMap((element): BuildNote[] => {
        const side = resolution.elements[element.id];
        if (side === undefined || !keptAgainstRemoval(element, side)) return [];
        const connections = connectionsOn(result.elements, element.id, side)
            .filter((candidate) => !isInResult(candidate))
            .map(({ id }) => id);
        return connections.length === 0
            ? []
            : [{ kind: "restoredWithoutConnections", id: element.id, connections }];
    });
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

function overlap(first: DiagramBounds, second: DiagramBounds): boolean {
    return (
        first.x < second.x + second.width &&
        second.x < first.x + first.width &&
        first.y < second.y + second.height &&
        second.y < first.y + first.height
    );
}
