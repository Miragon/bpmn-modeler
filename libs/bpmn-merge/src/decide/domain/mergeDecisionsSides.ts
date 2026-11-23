import {
    isConflictState,
    type MergeElement,
    type MergeSide,
    type ResolvedState,
} from "../../kernel/domain/mergeResult";
import { holdsRequiredPart, type Requirement } from "./referenceRules";

const AUTOMATIC_SIDE: Record<ResolvedState, MergeSide> = {
    unchanged: "current",
    sameChange: "current",
    sameAddition: "current",
    removedByBoth: "current",
    takenFromCurrent: "current",
    addedByCurrent: "current",
    removedByCurrent: "current",
    takenFromIncoming: "incoming",
    addedByIncoming: "incoming",
    removedByIncoming: "incoming",
};

/** The side of every decided element, before dangling automatic resolutions are opened. */
export class DecidedSides {
    private constructor(
        private readonly elementsById: ReadonlyMap<string, MergeElement>,
        private readonly picked: ReadonlyMap<string, MergeSide>,
        /** Pulled in or dropped for the picks; derived from them alone, never kept past a change of picks. */
        private readonly consequences: Map<string, MergeSide>,
    ) {}

    static automatic(elementsById: ReadonlyMap<string, MergeElement>): DecidedSides {
        return new DecidedSides(elementsById, new Map(), new Map());
    }

    /** The same decisions over other versions of the elements, as hand merges give them. */
    over(elementsById: ReadonlyMap<string, MergeElement>): DecidedSides {
        return new DecidedSides(elementsById, this.picked, new Map(this.consequences));
    }

    /** The picks over the automatic resolutions, without consequences yet. */
    withPicks(picks: ReadonlyMap<string, MergeSide>): DecidedSides {
        return new DecidedSides(this.elementsById, new Map(picks), new Map());
    }

    get picks(): ReadonlyMap<string, MergeSide> {
        return this.picked;
    }

    consequenceSideOf(id: string): MergeSide | undefined {
        return this.consequences.get(id);
    }

    decidedSideOf(id: string): MergeSide | undefined {
        const decided = this.picked.get(id) ?? this.consequences.get(id);
        if (decided !== undefined) {
            return decided;
        }
        const element = this.elementsById.get(id);
        return element === undefined || isConflictState(element.state)
            ? undefined
            : AUTOMATIC_SIDE[element.state];
    }

    isPicked(id: string): boolean {
        return this.picked.has(id);
    }

    /** Neither picked nor decided as a pick's consequence. */
    isAutomatic(id: string): boolean {
        return !this.picked.has(id) && !this.consequences.has(id);
    }

    isPresent(id: string): boolean {
        const side = this.decidedSideOf(id);
        return side !== undefined && this.elementsById.get(id)?.versions[side] !== undefined;
    }

    /** Decided to a side without it, or unknown to every version; an open element is pending, not absent. */
    isAbsent(id: string): boolean {
        return (
            !this.elementsById.has(id) ||
            (this.decidedSideOf(id) !== undefined && !this.isPresent(id))
        );
    }

    /** Its target is absent, or present on a side whose version lacks the part it names; an open target is pending. */
    isUnmet(requirement: Requirement): boolean {
        if (this.isAbsent(requirement.target)) {
            return true;
        }
        const side = this.decidedSideOf(requirement.target);
        const target = this.elementsById.get(requirement.target);
        return (
            side !== undefined &&
            target !== undefined &&
            !holdsRequiredPart(target, side, requirement)
        );
    }

    decideAsConsequence(id: string, side: MergeSide): void {
        this.consequences.set(id, side);
    }
}
