import { closePicks, closeUnpick, type ClosedDecisions } from "./mergeDecisionsClosure";
import { descendantsOf } from "./mergeDecisionsContainment";
import { findDanglingConflicts, type DanglingConflict } from "./mergeDecisionsDangling";
import { layoutSidesOf } from "./mergeDecisionsLayout";
import { DecidedSides } from "./mergeDecisionsSides";
import type { PickOutcome } from "./pickOutcome";
import {
    isConflictState,
    type ConflictState,
    type MergeElement,
    type MergeResult,
    type MergeSide,
} from "./mergeResult";
import { dependentsByTarget, type ReferenceIndex } from "./referenceRules";
import { connectionsRemovedWith, otherEndsOf } from "./removedConnections";
import type { UnmetRequirement } from "./unmetRequirement";

export type { BlockedPick, PickOutcome } from "./pickOutcome";

export type OpenConflict =
    | { readonly id: string; readonly state: ConflictState; readonly related: readonly string[] }
    | {
          readonly id: string;
          readonly state: "danglingReference";
          /** The requirements the decided sides leave unmet, on this element or naming it: a reference, or an id or pool another element shares. */
          readonly reasons: readonly UnmetRequirement[];
          readonly related: readonly string[];
      };

const NOTHING_DECIDED: PickOutcome = { applied: true, pulledIn: [], dropped: [] };

/** An automatic resolution, the user's pick, or what a pick pulled in or dropped. */
export type DecisionOrigin = "automatic" | "picked" | "consequence";

export interface MergeResolution {
    /** Every element id of the MergeResult: the side whose version is taken; absent on that side = not in the result. */
    readonly elements: Readonly<Record<string, MergeSide>>;
    /** Every element in the result that is drawn: the side whose DI is taken. */
    readonly layout: Readonly<Record<string, MergeSide>>;
}

/** The decisions of one merge: automatic resolutions, the user's picks and what keeps the result free of dangling references. */
export class MergeDecisions {
    private sides: DecidedSides;
    private dangling: ReadonlyMap<string, DanglingConflict>;

    private constructor(
        private readonly mergeResult: MergeResult,
        private readonly index: ReferenceIndex,
    ) {
        this.sides = DecidedSides.automatic(index.elementsById);
        this.dangling = this.findDangling();
    }

    static from(result: MergeResult): MergeDecisions {
        const elementsById = new Map(result.elements.map((element) => [element.id, element]));
        return new MergeDecisions(result, {
            elementsById,
            dependentsByTarget: dependentsByTarget(result.elements),
        });
    }

    get result(): MergeResult {
        return this.mergeResult;
    }

    get openConflicts(): readonly OpenConflict[] {
        return this.mergeResult.elements.flatMap((element) => {
            const conflict = this.openConflictOf(element);
            return conflict === undefined ? [] : [conflict];
        });
    }

    get canBuild(): boolean {
        return this.mergeResult.elements.every(
            (element) => this.openConflictOf(element) === undefined,
        );
    }

    /** Undefined while the element is open, a dangling automatic resolution included. */
    sideOf(id: string): MergeSide | undefined {
        return this.dangling.has(id) ? undefined : this.sides.decidedSideOf(id);
    }

    isInResult(id: string): boolean | undefined {
        return this.sideOf(id) === undefined ? undefined : this.sides.isPresent(id);
    }

    /** Who decided the element's side; undefined while it is open, a dangling automatic one included. */
    originOf(id: string): DecisionOrigin | undefined {
        this.requireElement(id);
        if (this.sideOf(id) === undefined) return undefined;
        if (this.sides.isPicked(id)) return "picked";
        return this.sides.isAutomatic(id) ? "automatic" : "consequence";
    }

    pick(id: string, side: MergeSide): PickOutcome {
        this.requireElement(id);
        const outcome = this.apply([id], side);
        if (!outcome.applied) return outcome;
        const connectionsLeftOut = this.connectionsLeftOut(id, side);
        return connectionsLeftOut.length === 0 ? outcome : { ...outcome, connectionsLeftOut };
    }

    /** The container and every descendant in either version, as one pick. */
    pickWithContents(id: string, side: MergeSide): PickOutcome {
        this.requireElement(id);
        return this.apply([id, ...descendantsOf(id, this.mergeResult.elements)], side);
    }

    /**
     * The flows `side`'s version connects to an element the other side removed, which the other side removed with
     * it and a pick of the element would leave out, as long as nobody decided them and their other ends stay in the
     * result. Empty when the other side kept the element, or when the pick is refused.
     */
    connectionsLeftOut(id: string, side: MergeSide): readonly string[] {
        const element = this.requireElement(id);
        const candidates = connectionsRemovedWith(this.mergeResult.elements, element, side);
        if (candidates.length === 0) return [];
        const trial = closePicks(this.index, this.sides, this.picksWith([id], side));
        if (!trial.outcome.applied) return [];
        const after = trial.after;
        const dangling = findDanglingConflicts(this.mergeResult.elements, this.index, after);
        const inResult = (candidate: string) => !dangling.has(candidate) && after.isPresent(candidate);
        return candidates
            .filter(
                (connection) =>
                    this.sides.isAutomatic(connection.id) &&
                    after.isAutomatic(connection.id) &&
                    !inResult(connection.id) &&
                    otherEndsOf(connection, id, side).every(inResult),
            )
            .map((connection) => connection.id);
    }

    /** The element and its `connectionsLeftOut`, as one pick. */
    pickWithConnections(id: string, side: MergeSide): PickOutcome {
        return this.apply([id, ...this.connectionsLeftOut(id, side)], side);
    }

    /**
     * Takes back the element's pick and the picks of the flows on its side that the other side removed with it, as
     * `pickWithConnections` made them: their picks would otherwise keep the element as a consequence.
     */
    unpickWithConnections(id: string): PickOutcome {
        const element = this.requireElement(id);
        const side = this.sides.picks.get(id);
        if (side === undefined) return NOTHING_DECIDED;
        const connections = connectionsRemovedWith(this.mergeResult.elements, element, side)
            .map((connection) => connection.id)
            .filter((connection) => this.sides.picks.get(connection) === side);
        return this.take(closeUnpick(this.index, this.sides, [id, ...connections]));
    }

    /** Takes back a container's pick and the picks of everything inside it on the same side. */
    unpickWithContents(id: string): PickOutcome {
        this.requireElement(id);
        const side = this.sides.picks.get(id);
        if (side === undefined) return NOTHING_DECIDED;
        const contents = descendantsOf(id, this.mergeResult.elements).filter(
            (descendant) => this.sides.picks.get(descendant) === side,
        );
        return this.take(closeUnpick(this.index, this.sides, [id, ...contents]));
    }

    /**
     * Takes the user's pick back: the element returns to its automatic resolution or to open, or stays where another
     * pick needs it. An automatic element both versions hold that it leaves unmet reopens as dangling.
     */
    unpick(id: string): PickOutcome {
        this.requireElement(id);
        if (!this.sides.isPicked(id)) return NOTHING_DECIDED;
        return this.take(closeUnpick(this.index, this.sides, [id]));
    }

    resolution(): MergeResolution {
        const open = this.openConflicts;
        if (open.length > 0) {
            throw new Error(
                `The merge has open conflicts: ${open.map((conflict) => conflict.id).join(", ")}`,
            );
        }
        const elements: Record<string, MergeSide> = {};
        for (const element of this.mergeResult.elements) {
            elements[element.id] = this.sides.decidedSideOf(element.id) as MergeSide;
        }
        const layout = layoutSidesOf(this.mergeResult.elements, (id) =>
            this.sides.isPresent(id) ? elements[id] : undefined,
        );
        return { elements, layout };
    }

    private apply(ids: readonly string[], side: MergeSide): PickOutcome {
        return this.take(closePicks(this.index, this.sides, this.picksWith(ids, side)));
    }

    private picksWith(ids: readonly string[], side: MergeSide): Map<string, MergeSide> {
        const picks = new Map(this.sides.picks);
        ids.forEach((id) => picks.set(id, side));
        return picks;
    }

    private take({ outcome, after }: ClosedDecisions): PickOutcome {
        this.sides = after;
        this.dangling = this.findDangling();
        return outcome;
    }

    private findDangling(): ReadonlyMap<string, DanglingConflict> {
        return findDanglingConflicts(this.mergeResult.elements, this.index, this.sides);
    }

    private openConflictOf(element: MergeElement): OpenConflict | undefined {
        const dangling = this.dangling.get(element.id);
        if (dangling !== undefined) {
            return {
                id: element.id,
                state: "danglingReference",
                reasons: dangling.reasons,
                related: dangling.related,
            };
        }
        if (this.sides.decidedSideOf(element.id) === undefined && isConflictState(element.state)) {
            return { id: element.id, state: element.state, related: [] };
        }
        return undefined;
    }

    private requireElement(id: string): MergeElement {
        const element = this.index.elementsById.get(id);
        if (element === undefined) {
            throw new Error(`The merge result has no element ${id}`);
        }
        return element;
    }
}
