import type { BlockedPick, ClosedPickOutcome } from "./pickOutcome";
import { findClashes, rivalCollaborationsOf } from "./mergeDecisionsClashes";
import type { DecidedSides } from "./mergeDecisionsSides";
import { MERGE_SIDES, type MergeElement, type MergeSide, otherSide } from "./mergeResult";
import {
    holdsRequiredPart,
    requirementsOf,
    type ReferenceIndex,
    type Requirement,
} from "./referenceRules";
import type { RequirementObstacle } from "./unmetRequirement";

export interface ClosedDecisions {
    readonly outcome: ClosedPickOutcome;
    readonly after: DecidedSides;
}

/**
 * Derives every consequence again from the picks alone, over the automatic resolutions: pulls in what a present
 * element needs and drops what an element leaves unmet, among elements the user did not pick. A consequence therefore
 * lasts only as long as the picks that cause it, whatever order they came in. An automatic element that cannot be
 * dropped is left to reopen; picks whose elements or consequences cannot stand together are refused.
 */
export function closePicks(
    index: ReferenceIndex,
    before: DecidedSides,
    picks: ReadonlyMap<string, MergeSide>,
): ClosedDecisions {
    const closure = new PickClosure(index, before.withPicks(picks), before.picks);
    const blockedBy = closure.run();
    if (blockedBy.length > 0) {
        return { outcome: { applied: false, blockedBy }, after: before };
    }
    const decidedNow = (id: string) =>
        before.consequenceSideOf(id) !== closure.sides.consequenceSideOf(id);
    return {
        outcome: {
            applied: true,
            pulledIn: closure.pulledIn.filter(decidedNow),
            dropped: closure.dropped.filter(decidedNow),
        },
        after: closure.sides,
    };
}

/** The picks without `ids`, closed as `closePicks` does. */
export function closeUnpick(
    index: ReferenceIndex,
    before: DecidedSides,
    ids: readonly string[],
): ClosedDecisions {
    const picks = new Map(before.picks);
    ids.forEach((id) => picks.delete(id));
    return closePicks(index, before, picks);
}

/** Each queued element remembers whether it stems from a pick this call makes or changes, or from an earlier one. */
interface Queued {
    readonly id: string;
    readonly fromThisCall: boolean;
}

class PickClosure {
    readonly pulledIn: string[] = [];
    readonly dropped: string[] = [];
    private readonly blockedByThisCall = new Map<string, BlockedPick>();
    private readonly blockedByEarlierPicks = new Map<string, BlockedPick>();
    private readonly changed: Set<string>;
    private readonly changedByThisCall = new Set<string>();
    private readonly queue: Queued[];
    private processed = 0;
    /** Whether the element being processed stems from this call's picks. */
    private processingFromThisCall = false;

    constructor(
        private readonly context: ReferenceIndex,
        readonly sides: DecidedSides,
        earlierPicks: ReadonlyMap<string, MergeSide>,
    ) {
        this.changed = new Set(sides.picks.keys());
        this.queue = [...sides.picks].map(([id, side]) => ({
            id,
            fromThisCall: earlierPicks.get(id) !== side,
        }));
    }

    /** Both ways of seeing one contradiction surface; only the one this call's picks reach is reported, if any. */
    run(): readonly BlockedPick[] {
        do {
            this.processQueue();
        } while (this.keepDanglingTargets());
        if (this.blockedBy().length === 0) {
            this.refuseClashesAmongDecided();
        }
        if (this.blockedBy().length === 0) {
            this.refuseElementsLeftWithoutAVersion();
        }
        return this.blockedBy();
    }

    private blockedBy(): readonly BlockedPick[] {
        const blockedBy =
            this.blockedByThisCall.size > 0 ? this.blockedByThisCall : this.blockedByEarlierPicks;
        return [...blockedBy.values()];
    }

    private processQueue(): void {
        for (; this.processed < this.queue.length; this.processed++) {
            const queued = this.queue[this.processed] as Queued;
            this.processingFromThisCall = queued.fromThisCall;
            if (queued.fromThisCall) {
                this.changedByThisCall.add(queued.id);
            }
            const element = this.context.elementsById.get(queued.id) as MergeElement;
            if (this.sides.isPresent(element.id)) {
                this.pullInTargetsOf(element);
                this.dropRivalCollaborationsOf(element);
            }
            this.dropDependentsOf(element.id);
        }
    }

    /**
     * A dangling automatic target that decided elements need, with no other version that would serve them, has no
     * way out but its own side: it is kept there and what it needs is pulled in, or the picks are refused. Done once
     * the rest has settled, so only targets that still dangle are kept.
     */
    private keepDanglingTargets(): boolean {
        const queuedBefore = this.queue.length;
        for (const id of [...this.changed]) {
            const side = this.sides.decidedSideOf(id) as MergeSide;
            if (!this.sides.isPresent(id)) {
                continue;
            }
            this.processingFromThisCall = this.changedByThisCall.has(id);
            const element = this.context.elementsById.get(id) as MergeElement;
            for (const { target } of requirementsOf(element, side)) {
                if (
                    this.sides.isAutomatic(target) &&
                    this.dangles(target) &&
                    !this.otherVersionServesDecidedDependents(target)
                ) {
                    this.decide(target, this.sides.decidedSideOf(target) as MergeSide, []);
                }
            }
        }
        return this.queue.length > queuedBefore;
    }

    private dangles(id: string): boolean {
        const element = this.context.elementsById.get(id);
        const side = this.sides.decidedSideOf(id);
        return (
            element !== undefined &&
            side !== undefined &&
            this.sides.isPresent(id) &&
            requirementsOf(element, side).some((requirement) => this.sides.isUnmet(requirement))
        );
    }

    private otherVersionServesDecidedDependents(targetId: string): boolean {
        const target = this.context.elementsById.get(targetId) as MergeElement;
        const other = otherSide(this.sides.decidedSideOf(targetId) as MergeSide);
        return (
            target.versions[other] !== undefined &&
            (this.context.dependentsByTarget.get(targetId) ?? []).every(
                ({ element, side, requirement }) =>
                    this.sides.isAutomatic(element.id) ||
                    this.sides.decidedSideOf(element.id) !== side ||
                    holdsRequiredPart(target, other, requirement),
            )
        );
    }

    private pullInTargetsOf(element: MergeElement): void {
        const side = this.sides.decidedSideOf(element.id) as MergeSide;
        for (const requirement of requirementsOf(element, side)) {
            if (!this.sides.isUnmet(requirement)) {
                continue;
            }
            const obstacle = this.obstacleToPullingIn(requirement, side);
            if (obstacle === undefined) {
                this.decide(requirement.target, side, this.pulledIn);
            } else {
                this.block(requirement.target, element, requirement, obstacle);
            }
        }
    }

    private obstacleToPullingIn(
        requirement: Requirement,
        side: MergeSide,
    ): RequirementObstacle | undefined {
        const targetId = requirement.target;
        const target = this.context.elementsById.get(targetId);
        const missing = this.sides.isPresent(targetId) ? "part" : "target";
        // Decided whenever it is picked or present.
        const targetSide = this.sides.decidedSideOf(targetId) as MergeSide;
        if (target === undefined) {
            return { kind: "targetInNoVersion" };
        }
        if (this.sides.isPicked(targetId)) {
            return { kind: "targetPickedWithout", side: targetSide, missing };
        }
        if (this.changed.has(targetId)) {
            return missing === "target"
                ? { kind: "targetDroppedByThisPick" }
                : { kind: "targetTakenByThisPickWithoutPart", side: targetSide };
        }
        if (target.versions[side] === undefined) {
            return { kind: "sideLacksTarget", side, missing: "target" };
        }
        if (!holdsRequiredPart(target, side, requirement)) {
            return { kind: "sideLacksTarget", side, missing: "part" };
        }
        return undefined;
    }

    /** Of two elements that cannot stand side by side, an automatic one reopens; picks and consequences do not. */
    private refuseClashesAmongDecided(): void {
        const elements = [...this.context.elementsById.values()];
        for (const { reason, involved } of findClashes(elements, this.context, this.sides)) {
            if (involved.some((id) => !this.changed.has(id))) {
                continue;
            }
            this.processingFromThisCall = involved.some((id) => this.changedByThisCall.has(id));
            const keptAgainstThisCall =
                involved.find((id) => !this.changedByThisCall.has(id)) ?? involved[1];
            this.record({ id: keptAgainstThisCall, reason });
        }
    }

    /** An open element both versions hold needs a version whose missing targets can still be pulled in. */
    private refuseElementsLeftWithoutAVersion(): void {
        for (const element of this.context.elementsById.values()) {
            const open =
                this.sides.decidedSideOf(element.id) === undefined || this.dangles(element.id);
            if (
                !open ||
                !this.sides.isAutomatic(element.id) ||
                sideWithout(element) !== undefined
            ) {
                continue;
            }
            const firstObstacles = MERGE_SIDES.map((side) =>
                requirementsOf(element, side)
                    .filter((requirement) => this.sides.isUnmet(requirement))
                    .map((requirement) => ({
                        requirement,
                        obstacle: this.obstacleToPullingIn(requirement, side),
                    }))
                    .find(({ obstacle }) => obstacle !== undefined),
            );
            if (firstObstacles.every((found) => found !== undefined)) {
                this.processingFromThisCall = firstObstacles.some(({ requirement }) =>
                    this.changedByThisCall.has(requirement.target),
                );
                for (const { requirement, obstacle } of firstObstacles) {
                    this.block(element.id, element, requirement, obstacle as RequirementObstacle);
                }
            }
        }
    }

    private dropRivalCollaborationsOf(collaboration: MergeElement): void {
        for (const { rival, process } of rivalCollaborationsOf(
            collaboration.id,
            this.context,
            this.sides,
        )) {
            this.dropDecidedDependent(rival, this.sides.decidedSideOf(rival.id) as MergeSide, {
                kind: "soleCollaboration",
                target: collaboration.id,
                process,
            });
        }
    }

    private dropDependentsOf(targetId: string): void {
        for (const { element, side, requirement } of this.context.dependentsByTarget.get(
            targetId,
        ) ?? []) {
            if (!this.sides.isUnmet(requirement)) {
                continue;
            }
            const elementSide = this.sides.decidedSideOf(element.id);
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
        const sideWithoutIt = sideWithout(element);
        if (this.sides.isPicked(element.id)) {
            this.block(element.id, element, requirement, { kind: "dependentPicked", side });
        } else if (this.changed.has(element.id)) {
            this.block(element.id, element, requirement, { kind: "dependentPulledInByThisPick" });
        } else if (sideWithoutIt !== undefined) {
            this.decide(element.id, sideWithoutIt, this.dropped);
        }
        // Otherwise it reopens: its version from the side the target comes from cannot name the target.
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
        this.queue.push({ id, fromThisCall: this.processingFromThisCall });
    }

    private block(
        id: string,
        element: MergeElement,
        requirement: Requirement,
        obstacle: RequirementObstacle,
    ): void {
        this.record({
            id,
            reason: { element: { id: element.id, state: element.state }, requirement, obstacle },
        });
    }

    private record(blocked: BlockedPick): void {
        const blockedBy = this.processingFromThisCall
            ? this.blockedByThisCall
            : this.blockedByEarlierPicks;
        blockedBy.set(JSON.stringify(blocked), blocked);
    }
}

function sideWithout(element: MergeElement): MergeSide | undefined {
    return MERGE_SIDES.find((side) => element.versions[side] === undefined);
}
