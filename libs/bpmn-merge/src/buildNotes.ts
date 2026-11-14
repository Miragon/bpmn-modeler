import type { MergeResolution } from "./mergeDecisions";
import { isEdgeEnd } from "./referenceRules";
import {
    type ElementVersion,
    type LayoutState,
    MERGE_SIDES,
    type MergeElement,
    type MergeResult,
    type MergeSide,
} from "./mergeResult";

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
    | { readonly kind: "frameDiffers"; readonly attribute: string };

export interface DiagramBounds {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

/** Containers whose shape encloses their contents' shapes; a process, a pool and an activity's associations do not count. */
const ENCLOSING_CONTAINER_TYPES: ReadonlySet<string> = new Set([
    "bpmn:SubProcess",
    "bpmn:Transaction",
    "bpmn:AdHocSubProcess",
    "bpmn:Lane",
]);

/**
 * A drawn flow whose waypoints were drawn on one side while an end's shape
 * comes from the other: its waypoints may no longer meet that shape. A layout
 * both sides share counts for neither.
 */
export function flowEndsNotes(result: MergeResult, resolution: MergeResolution): BuildNote[] {
    const drawnFrom = drawnFromOf(result, resolution);
    const notes: BuildNote[] = [];
    for (const element of result.elements) {
        const version = chosenVersionOf(element, resolution);
        if (!version || resolution.layout[element.id] === undefined) continue;
        const ends = [
            ...new Set(
                version.references.filter(isEdgeEnd).map(({ target }) => target),
            ),
        ];
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
                element.versions.base === undefined &&
                resolution.elements[element.id] === side &&
                MERGE_SIDES.every(
                    (other) => (element.versions[other] !== undefined) === (other === side),
                );
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
 * An element drawn from another side than the sub-process or lane that holds
 * it: its shape may lie outside that container's, or on another plane than
 * its siblings. A layout both sides share counts for neither.
 */
export function drawnApartFromContainerNotes(
    result: MergeResult,
    resolution: MergeResolution,
): BuildNote[] {
    const typesById = new Map(result.elements.map(({ id, type }) => [id, type]));
    const drawnFrom = drawnFromOf(result, resolution);
    return result.elements.flatMap((element): BuildNote[] => {
        const version = chosenVersionOf(element, resolution);
        const side = drawnFrom(element.id);
        if (!version || side === undefined) return [];
        const containers = [
            ...(version.parent === undefined ? [] : [version.parent]),
            ...version.lanes,
        ].filter((container) => {
            const containerSide = drawnFrom(container);
            return (
                ENCLOSING_CONTAINER_TYPES.has(typesById.get(container) ?? "") &&
                containerSide !== undefined &&
                containerSide !== side
            );
        });
        return containers.length === 0
            ? []
            : [{ kind: "drawnApartFromContainer", id: element.id, containers }];
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

function chosenVersionOf(
    element: MergeElement,
    resolution: MergeResolution,
): ElementVersion | undefined {
    const side = resolution.elements[element.id];
    return side === undefined ? undefined : element.versions[side];
}

function overlap(first: DiagramBounds, second: DiagramBounds): boolean {
    return (
        first.x < second.x + second.width &&
        second.x < first.x + first.width &&
        first.y < second.y + second.height &&
        second.y < first.y + first.height
    );
}
