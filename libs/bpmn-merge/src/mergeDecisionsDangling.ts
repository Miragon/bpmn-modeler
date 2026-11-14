import type { DecidedSides } from "./mergeDecisionsSides";
import type { MergeElement } from "./mergeResult";
import {
    describeRequirement,
    requiredPartOf,
    requirementsOf,
    type Requirement,
} from "./referenceRules";

export interface DanglingConflict {
    readonly reason: string;
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
    const found = new Map<string, { readonly reasons: string[]; readonly related: Set<string> }>();
    const open = (id: string, reason: string, involved: readonly string[]) => {
        const conflict = found.get(id) ?? { reasons: [], related: new Set<string>() };
        conflict.reasons.push(reason);
        involved.forEach((involvedId) => conflict.related.add(involvedId));
        found.set(id, conflict);
    };

    for (const element of elements) {
        const side = sides.sideOf(element.id);
        if (side === undefined) {
            continue;
        }
        for (const requirement of requirementsOf(element, side)) {
            if (!sides.isUnmet(requirement)) {
                continue;
            }
            const reason = danglingReason(
                element,
                requirement,
                elementsById.get(requirement.target),
                sides,
            );
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
                reason: conflict.reasons.join("; "),
                related: [...conflict.related].sort(byResultOrder),
            },
        ]),
    );
}

function danglingReason(
    element: MergeElement,
    requirement: Requirement,
    target: MergeElement | undefined,
    sides: DecidedSides,
): string {
    return `${element.id} (${element.state}) ${describeRequirement(requirement)}, but ${missingTarget(requirement, target, sides)}`;
}

function missingTarget(
    requirement: Requirement,
    target: MergeElement | undefined,
    sides: DecidedSides,
): string {
    if (target === undefined) {
        return `no version has ${requirement.target}`;
    }
    return sides.isPresent(target.id)
        ? `${target.id} is taken from ${sides.sideOf(target.id)}, which does not hold ${requiredPartOf(requirement)}`
        : `${target.id} is not in the result (${target.state})`;
}
