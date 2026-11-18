import type { HandMergedVersion, HandMergeRefusal } from "./handMerge";
import { closePicks } from "./mergeDecisionsClosure";
import { findDanglingConflicts, type DanglingConflict } from "./mergeDecisionsDangling";
import type { DecidedSides } from "./mergeDecisionsSides";
import type { ElementReference, ElementVersion, MergeElement, MergeResult } from "./mergeResult";
import {
    dependentsByTarget,
    isEdgeEnd,
    isHostReference,
    isProcessReference,
    type ReferenceIndex,
    requirementsOf,
} from "./referenceRules";

/** What the decisions read: the result with each hand-merged version in place of its side's. */
export interface EffectiveElements {
    readonly result: MergeResult;
    readonly index: ReferenceIndex;
}

/** The decisions as they stand, which a change of the hand merges must keep. */
export interface StandingDecisions {
    readonly elements: readonly MergeElement[];
    readonly sides: DecidedSides;
    readonly dangling: ReadonlyMap<string, DanglingConflict>;
}

export type HandMergeTrial =
    | { readonly refusal: HandMergeRefusal }
    | {
          readonly after: DecidedSides;
          readonly dangling: ReadonlyMap<string, DanglingConflict>;
      };

export function effectiveElementsOf(
    plain: MergeResult,
    handMerges: ReadonlyMap<string, HandMergedVersion>,
): EffectiveElements {
    const elements =
        handMerges.size === 0
            ? plain.elements
            : plain.elements.map((element) => {
                  const handMerge = handMerges.get(element.id);
                  return handMerge === undefined
                      ? element
                      : {
                            ...element,
                            versions: { ...element.versions, [handMerge.side]: handMerge.version },
                        };
              });
    return {
        result: elements === plain.elements ? plain : { ...plain, elements },
        index: {
            elementsById: new Map(elements.map((element) => [element.id, element])),
            dependentsByTarget: dependentsByTarget(elements),
        },
    };
}

/**
 * The decisions over `effective`, the elements with the hand merges changed
 * for `id`, while the picks stay: refused when `id`'s version names an
 * element no version holds or the result leaves out, or when any element but
 * `id` would change its decision.
 */
export function trialOfHandMerges(
    effective: EffectiveElements,
    standing: StandingDecisions,
    id: string,
): HandMergeTrial {
    const { sides } = standing;
    const before = sides.over(effective.index.elementsById);
    const element = effective.index.elementsById.get(id)!;
    const requirements = requirementsOf(element, sides.picks.get(id)!);
    const missing = requirements
        .filter(({ target }) => !effective.index.elementsById.has(target))
        .map(({ target }) => target);
    if (missing.length > 0) {
        return { refusal: { kind: "namesMissingElement", ids: unique(missing) } };
    }
    const leftOut = requirements
        .filter((requirement) => before.isUnmet(requirement))
        .map(({ target }) => target);
    if (leftOut.length > 0) {
        return { refusal: { kind: "namesLeftOutElement", ids: unique(leftOut) } };
    }
    const { outcome, after } = closePicks(effective.index, before, sides.picks);
    if (!outcome.applied) {
        return {
            refusal: {
                kind: "changesOtherDecisions",
                ids: unique(outcome.blockedBy.map((blocked) => blocked.id)),
            },
        };
    }
    const dangling = findDanglingConflicts(effective.result.elements, effective.index, after);
    const changed = standing.elements
        .map((candidate) => candidate.id)
        .filter(
            (candidate) =>
                decisionOf(candidate, sides, standing.dangling) !==
                decisionOf(candidate, after, dangling),
        );
    if (changed.length > 0) return { refusal: { kind: "changesOtherDecisions", ids: changed } };
    return { after, dangling };
}

/** The references that place an element, an edge's ends, a boundary event's host and a pool's process, that differ. */
export function changedStructuralProperties(
    before: ElementVersion,
    after: ElementVersion,
): string[] {
    const placing = (version: ElementVersion) =>
        version.references.filter(
            (reference) =>
                isEdgeEnd(reference) || isHostReference(reference) || isProcessReference(reference),
        );
    const keyOf = ({ property, target, targetPart }: ElementReference) =>
        JSON.stringify([property, target, targetPart ?? null]);
    const beforeKeys = new Set(placing(before).map(keyOf));
    const afterKeys = new Set(placing(after).map(keyOf));
    return unique(
        [
            ...placing(before).filter((reference) => !afterKeys.has(keyOf(reference))),
            ...placing(after).filter((reference) => !beforeKeys.has(keyOf(reference))),
        ].map(({ property }) => property),
    );
}

/** An element's side and presence, or open while it dangles, as one comparable text. */
function decisionOf(
    id: string,
    sides: DecidedSides,
    dangling: ReadonlyMap<string, DanglingConflict>,
): string {
    const side = dangling.has(id) ? undefined : sides.decidedSideOf(id);
    return side === undefined ? "open" : `${side}:${sides.isPresent(id)}`;
}

function unique(ids: readonly string[]): string[] {
    return [...new Set(ids)];
}
