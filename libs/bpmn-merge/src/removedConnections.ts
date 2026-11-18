import {
    type ElementVersion,
    type MergeElement,
    type MergeSide,
    type SideInResult,
    chosenVersionOf,
    otherSide,
} from "./mergeResult";
import { isDefaultFlowReference, isEdgeEnd, isEdgeSource } from "./referenceRules";

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
 * as its default unless that version names another flow, which the removing side chose and is kept. The dangling rule
 * keeps that flow in the result, as every reference of a built result is met. Derived from the sides alone, so it
 * follows the picks, not the way the flow came back.
 */
export function restoredFlowDefaultsOf(
    elements: readonly MergeElement[],
    sideInResult: SideInResult,
): readonly RestoredFlowDefault[] {
    const elementsById = new Map(elements.map((element) => [element.id, element]));
    return elements.flatMap((flow): RestoredFlowDefault[] => {
        const side = sideInResult(flow.id);
        if (side === undefined || !keptAgainstRemoval(flow, side)) return [];
        const source = sourceDefaultingTo(flow, side, elementsById);
        if (source === undefined) return [];
        const sourceInResult = chosenVersionOf(source, sideInResult);
        if (sourceInResult === undefined) return [];
        const keptDefault = defaultFlowOf(sourceInResult);
        if (keptDefault === flow.id) return [];
        return keptDefault === undefined
            ? [{ kind: "restored", source: source.id, flow: flow.id }]
            : [{ kind: "otherDefaultKept", source: source.id, flow: flow.id, keptDefault }];
    });
}

/** The flow's source when its version on `side` names the flow as its default. */
function sourceDefaultingTo(
    flow: MergeElement,
    side: MergeSide,
    elementsById: ReadonlyMap<string, MergeElement>,
): MergeElement | undefined {
    const sourceId = flow.versions[side]?.references.find(isEdgeSource)?.target;
    const source = sourceId === undefined ? undefined : elementsById.get(sourceId);
    return defaultFlowOf(source?.versions[side]) === flow.id ? source : undefined;
}

function defaultFlowOf(version: ElementVersion | undefined): string | undefined {
    return version?.references.find(isDefaultFlowReference)?.target;
}
