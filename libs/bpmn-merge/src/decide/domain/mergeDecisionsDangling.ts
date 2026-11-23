import { findClashes } from "./mergeDecisionsClashes";
import type { DecidedSides } from "./mergeDecisionsSides";
import type { MergeElement, MergeSide } from "../../kernel/domain/mergeResult";
import { requirementsOf, type ReferenceIndex } from "./referenceRules";
import type { RequirementObstacle, UnmetRequirement } from "./unmetRequirement";

export interface DanglingConflict {
    readonly reasons: readonly UnmetRequirement[];
    readonly related: readonly string[];
}

/**
 * Checked against the decided sides, so an element opened here never makes another one dangle:
 * the fixpoint is reached in one pass, and an element that only names an opened one stays resolved.
 * Only automatic elements open: the picks never leave a picked or consequential element's references unmet, and
 * they refuse to keep two such elements that clash, so of every pair that cannot stand an automatic one gives way.
 */
export function findDanglingConflicts(
    elements: readonly MergeElement[],
    index: ReferenceIndex,
    sides: DecidedSides,
): ReadonlyMap<string, DanglingConflict> {
    const { elementsById } = index;
    const found = new Map<
        string,
        { readonly reasons: UnmetRequirement[]; readonly related: Set<string> }
    >();
    const open = (id: string, reason: UnmetRequirement, involved: readonly string[]) => {
        if (!sides.isAutomatic(id)) {
            return;
        }
        const conflict = found.get(id) ?? { reasons: [], related: new Set<string>() };
        conflict.reasons.push(reason);
        involved.forEach((involvedId) => conflict.related.add(involvedId));
        found.set(id, conflict);
    };

    for (const element of elements) {
        const side = sides.decidedSideOf(element.id);
        if (side === undefined) {
            continue;
        }
        for (const requirement of requirementsOf(element, side)) {
            if (!sides.isUnmet(requirement)) {
                continue;
            }
            const reason: UnmetRequirement = {
                element: { id: element.id, state: element.state },
                requirement,
                obstacle: obstacleOf(elementsById.get(requirement.target), sides),
            };
            const involved = [element.id, requirement.target];
            open(element.id, reason, involved);
            if (elementsById.has(requirement.target)) {
                open(requirement.target, reason, involved);
            }
        }
    }

    for (const { reason, involved } of findClashes(elements, index, sides)) {
        involved.forEach((id) => open(id, reason, involved));
    }

    const resultOrder = new Map(elements.map((element, index) => [element.id, index]));
    const byResultOrder = (left: string, right: string) =>
        (resultOrder.get(left) ?? elements.length) - (resultOrder.get(right) ?? elements.length);
    return new Map(
        [...found].map(([id, conflict]) => [
            id,
            {
                reasons: conflict.reasons,
                related: [...conflict.related].sort(byResultOrder),
            },
        ]),
    );
}

function obstacleOf(target: MergeElement | undefined, sides: DecidedSides): RequirementObstacle {
    if (target === undefined) {
        return { kind: "targetInNoVersion" };
    }
    return sides.isPresent(target.id)
        ? {
              kind: "targetTakenWithoutPart",
              side: sides.decidedSideOf(target.id) as MergeSide,
          }
        : { kind: "targetNotInResult", targetState: target.state };
}
