import {
    type ElementVersion,
    type MergeElement,
    type MergeSide,
    type SideInResult,
    chosenVersionOf,
    otherSide,
} from "./mergeResult";
import { isDefaultFlowReference, isEdgeEnd } from "./referenceRules";

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

/**
 * Removing a flow takes its source's `default` with it, so a pick that keeps the flow against the removal means its
 * default too. The source keeps the version the result takes, with all of that side's changes; it gets the flow back
 * as its default unless that version names another flow of the result, which the removing side chose and is kept.
 * Derived from the sides alone, so it follows the picks, not the way the flow came back.
 */
export function restoredFlowDefaultsOf(
    elements: readonly MergeElement[],
    sideInResult: SideInResult,
): readonly RestoredFlowDefault[] {
    const elementsById = new Map(elements.map((element) => [element.id, element]));
    const versionInResult = (id: string) => {
        const element = elementsById.get(id);
        return element === undefined ? undefined : chosenVersionOf(element, sideInResult);
    };
    return elements.flatMap((flow): RestoredFlowDefault[] => {
        const side = sideInResult(flow.id);
        if (side === undefined || !keptAgainstRemoval(flow, side)) return [];
        const ends = new Set(otherEndsOf(flow, flow.id, side));
        return [...ends].flatMap((source): RestoredFlowDefault[] => {
            if (defaultFlowOf(elementsById.get(source)?.versions[side]) !== flow.id) return [];
            const sourceInResult = versionInResult(source);
            if (sourceInResult === undefined) return [];
            const keptDefault = defaultFlowOf(sourceInResult);
            if (keptDefault === flow.id) return [];
            return keptDefault !== undefined && versionInResult(keptDefault) !== undefined
                ? [{ kind: "otherDefaultKept", source, flow: flow.id, keptDefault }]
                : [{ kind: "restored", source, flow: flow.id }];
        });
    });
}

function defaultFlowOf(version: ElementVersion | undefined): string | undefined {
    return version?.references.find(isDefaultFlowReference)?.target;
}
