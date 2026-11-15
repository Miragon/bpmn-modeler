import { MERGE_SIDES, type MergeElement, type MergeSide } from "./mergeResult";
import { isEdgeEnd } from "./referenceRules";

/** The ancestor and `side` have the element and the other side removed it. */
export function keptAgainstRemoval(element: MergeElement, side: MergeSide): boolean {
    return (
        element.versions.base !== undefined &&
        element.versions[side] !== undefined &&
        MERGE_SIDES.some((other) => other !== side && element.versions[other] === undefined)
    );
}

/** The flows, message flows and associations whose version on `side` starts or ends at the element. */
export function connectionsOn(
    elements: readonly MergeElement[],
    elementId: string,
    side: MergeSide,
): readonly MergeElement[] {
    return elements.filter((candidate) =>
        (candidate.versions[side]?.references ?? []).some(
            (reference) => isEdgeEnd(reference) && reference.target === elementId,
        ),
    );
}

/** The connections `side` keeps for an element the other side removed, which the other side removed with it. */
export function connectionsRemovedWith(
    elements: readonly MergeElement[],
    element: MergeElement,
    side: MergeSide,
): readonly MergeElement[] {
    return keptAgainstRemoval(element, side)
        ? connectionsOn(elements, element.id, side).filter((connection) =>
              keptAgainstRemoval(connection, side),
          )
        : [];
}

/** The ends of a connection's version on `side` other than the element. */
export function otherEndsOf(
    connection: MergeElement,
    elementId: string,
    side: MergeSide,
): readonly string[] {
    return (connection.versions[side]?.references ?? [])
        .filter((reference) => isEdgeEnd(reference) && reference.target !== elementId)
        .map(({ target }) => target);
}
