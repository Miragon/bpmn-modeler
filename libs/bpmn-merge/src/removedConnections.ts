import { type MergeElement, type MergeSide, type SideInResult, otherSide } from "./mergeResult";
import { isEdgeEnd } from "./referenceRules";

/** The ancestor and `side` have the element and the other side removed it. */
export function keptAgainstRemoval(element: MergeElement, side: MergeSide): boolean {
    return (
        element.versions.base !== undefined &&
        element.versions[side] !== undefined &&
        element.versions[otherSide(side)] === undefined
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

/** What becomes of the default a flow kept against the other side's removal was of its source on the keeping side. */
export type RestoredFlowDefault =
    | { readonly kind: "restored"; readonly source: string; readonly flow: string }
    | {
          readonly kind: "otherDefaultKept";
          readonly source: string;
          readonly flow: string;
          readonly keptDefault: string;
      };

export function restoredFlowDefaultsOf(
    _elements: readonly MergeElement[],
    _sideInResult: SideInResult,
): readonly RestoredFlowDefault[] {
    return [];
}
