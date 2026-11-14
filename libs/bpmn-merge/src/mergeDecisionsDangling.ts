import type { DecidedSides } from "./mergeDecisionsSides";
import type { MergeElement, MergeSide } from "./mergeResult";
import { requirementsOf } from "./referenceRules";
import type { RequirementObstacle, UnmetRequirement } from "./unmetRequirement";

export interface DanglingConflict {
    readonly reasons: readonly UnmetRequirement[];
    readonly related: readonly string[];
}

/**
 * Checked against the decided sides, so an element opened here never makes another one dangle:
 * the fixpoint is reached in one pass, and an element that only names an opened one stays resolved.
 * A pick never leaves a picked element dangling, so in practice only automatic resolutions open here.
 */
export function findDanglingConflicts(
    elements: readonly MergeElement[],
    elementsById: ReadonlyMap<string, MergeElement>,
    sides: DecidedSides,
): ReadonlyMap<string, DanglingConflict> {
    const found = new Map<
        string,
        { readonly reasons: UnmetRequirement[]; readonly related: Set<string> }
    >();
    const open = (id: string, reason: UnmetRequirement, involved: readonly string[]) => {
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
