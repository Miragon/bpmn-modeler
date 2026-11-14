import type { PickOutcome } from "./pickOutcome";
import type { DecidedSides } from "./mergeDecisionsSides";
import { MERGE_SIDES, type MergeElement, type MergeSide } from "./mergeResult";
import {
    describeRequirement,
    holdsRequiredPart,
    requiredPartOf,
    requirementsOf,
    type Dependent,
    type Requirement,
} from "./referenceRules";

export interface PickContext {
    readonly elementsById: ReadonlyMap<string, MergeElement>;
    readonly dependentsByTarget: ReadonlyMap<string, readonly Dependent[]>;
}

export interface ClosedDecisions {
    readonly outcome: PickOutcome;
    readonly after: DecidedSides;
}

/**
 * Applies the picks to a copy of the sides, then pulls in what a present element needs and drops
 * what an element leaves unmet, among elements the user did not pick.
 */
export function closePicks(
    context: PickContext,
    before: DecidedSides,
    picks: ReadonlyMap<string, MergeSide>,
): ClosedDecisions {
    const sides = before.copy();
    for (const [id, side] of picks) {
        sides.pick(id, side);
    }
    return close(context, before, sides, [...picks.keys()]);
}

/** Returns the element to its automatic resolution, or to open, and closes over the consequences as a pick does. */
export function closeUnpick(
    context: PickContext,
    before: DecidedSides,
    id: string,
): ClosedDecisions {
    const sides = before.copy();
    sides.unpick(id);
    return close(context, before, sides, [id]);
}

function close(
    context: PickContext,
    before: DecidedSides,
    sides: DecidedSides,
    changedIds: readonly string[],
): ClosedDecisions {
    const closure = new PickClosure(context, sides, changedIds);
    const blockedBy = closure.run();
    if (blockedBy.length > 0) {
        return { outcome: { applied: false, blockedBy }, after: before };
    }
    return {
        outcome: { applied: true, pulledIn: closure.pulledIn, dropped: closure.dropped },
        after: closure.sides,
    };
}

class PickClosure {
    readonly pulledIn: string[] = [];
    readonly dropped: string[] = [];
    private readonly blockedBy = new Map<
        string,
        { readonly id: string; readonly reason: string }
    >();
    private readonly changed: Set<string>;
    private readonly queue: string[];

    constructor(
        private readonly context: PickContext,
        readonly sides: DecidedSides,
        changedIds: readonly string[],
    ) {
        this.changed = new Set(changedIds);
        this.queue = [...changedIds];
    }

    run(): readonly { readonly id: string; readonly reason: string }[] {
        for (let index = 0; index < this.queue.length; index++) {
            const element = this.context.elementsById.get(
                this.queue[index] as string,
            ) as MergeElement;
            if (this.sides.isPresent(element.id)) {
                this.pullInTargetsOf(element);
            }
            this.dropDependentsOf(element.id);
        }
        return [...this.blockedBy.values()];
    }

    private pullInTargetsOf(element: MergeElement): void {
        const side = this.sides.sideOf(element.id) as MergeSide;
        for (const requirement of requirementsOf(element, side)) {
            if (!this.sides.isUnmet(requirement)) {
                continue;
            }
            const targetId = requirement.target;
            const blocked = (why: string) =>
                this.block(
                    targetId,
                    `${describeElement(element)} ${describeRequirement(requirement)}, but ${why}`,
                );
            const target = this.context.elementsById.get(targetId);
            const part = requiredPartOf(requirement);
            const lacking = this.sides.isPresent(targetId) ? part : undefined;
            const targetSide = this.sides.sideOf(targetId);
            if (target === undefined) {
                blocked(`no version has ${targetId}`);
            } else if (this.sides.isPicked(targetId)) {
                blocked(
                    lacking === undefined
                        ? `${targetId} is picked from ${targetSide}, which does not have it`
                        : `${targetId} is picked from ${targetSide}, which does not hold ${lacking}`,
                );
            } else if (this.changed.has(targetId)) {
                blocked(
                    lacking === undefined
                        ? `this pick drops ${targetId}`
                        : `this pick takes ${targetId} from ${targetSide}, which does not hold ${lacking}`,
                );
            } else if (target.versions[side] === undefined) {
                blocked(`${side} does not have ${targetId}`);
            } else if (!holdsRequiredPart(target, side, requirement)) {
                blocked(`${side} does not hold ${part} inside ${targetId}`);
            } else {
                this.decide(targetId, side, this.pulledIn);
            }
        }
    }

    private dropDependentsOf(targetId: string): void {
        for (const { element, side, requirement } of this.context.dependentsByTarget.get(
            targetId,
        ) ?? []) {
            if (!this.sides.isUnmet(requirement)) {
                continue;
            }
            const elementSide = this.sides.sideOf(element.id);
            if (elementSide === undefined) {
                this.dropOpenDependent(element, targetId);
            } else if (elementSide === side) {
                this.dropDecidedDependent(element, side, requirement);
            }
        }
    }

    private dropDecidedDependent(
        element: MergeElement,
        side: MergeSide,
        requirement: Requirement,
    ): void {
        const blocked = (why: string) =>
            this.block(
                element.id,
                `${describeElement(element)} ${describeRequirement(requirement)} and ${why}`,
            );
        const sideWithoutIt = sideWithout(element);
        if (this.sides.isPicked(element.id)) {
            blocked(`is picked from ${side}`);
        } else if (this.changed.has(element.id)) {
            blocked("this pick pulls it in");
        } else if (sideWithoutIt === undefined) {
            blocked("is in both versions");
        } else {
            this.decide(element.id, sideWithoutIt, this.dropped);
        }
    }

    private dropOpenDependent(element: MergeElement, targetId: string): void {
        const sideWithoutIt = sideWithout(element);
        const everyVersionNeedsIt = MERGE_SIDES.filter(
            (side) => element.versions[side] !== undefined,
        ).every((side) =>
            requirementsOf(element, side).some(
                (requirement) => requirement.target === targetId && this.sides.isUnmet(requirement),
            ),
        );
        if (sideWithoutIt !== undefined && everyVersionNeedsIt) {
            this.decide(element.id, sideWithoutIt, this.dropped);
        }
    }

    private decide(id: string, side: MergeSide, consequence: string[]): void {
        this.sides.decideAsConsequence(id, side);
        this.changed.add(id);
        consequence.push(id);
        this.queue.push(id);
    }

    private block(id: string, reason: string): void {
        this.blockedBy.set(`${id}\n${reason}`, { id, reason });
    }
}

function describeElement(element: MergeElement): string {
    return `${element.id} (${element.state})`;
}

function sideWithout(element: MergeElement): MergeSide | undefined {
    return MERGE_SIDES.find((side) => element.versions[side] === undefined);
}
