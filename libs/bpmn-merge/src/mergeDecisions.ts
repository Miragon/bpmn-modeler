import { closePicks, closeUnpick, type ClosedDecisions } from "./mergeDecisionsClosure";
import { descendantsOf } from "./mergeDecisionsContainment";
import { findDanglingConflicts, type DanglingConflict } from "./mergeDecisionsDangling";
import { layoutSidesOf } from "./mergeDecisionsLayout";
import { DecidedSides } from "./mergeDecisionsSides";
import type { PickOutcome, PickScope, RemovedWithLeftOut } from "./pickOutcome";
import {
    isConflictState,
    type ConflictState,
    type MergeElement,
    type MergeResult,
    type MergeSide,
} from "./mergeResult";
import { dependentsByTarget, type ReferenceIndex, requirementsOf } from "./referenceRules";
import { idsRemovedWith, otherEndsOf, removedWith } from "./removedConnections";
import type { UnmetRequirement } from "./unmetRequirement";

export type { BlockedPick, PickOutcome, PickScope, RemovedWithLeftOut } from "./pickOutcome";

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
const NOTHING_LEFT_OUT: RemovedWithLeftOut = { connections: [], boundaryEvents: [] };

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

    /** Whether `side`'s version holds the element, so a pick of `side` keeps it rather than leaving it out. */
    holds(id: string, side: MergeSide): boolean {
        return this.requireElement(id).versions[side] !== undefined;
    }

    /** A pick as far as `scope` reaches. */
    pickScoped(id: string, side: MergeSide, scope: PickScope): PickOutcome {
        switch (scope) {
            case "element":
                return this.pick(id, side);
            case "withContents":
                return this.pickWithContents(id, side);
            case "withConnections":
                return this.pickWithConnections(id, side);
        }
    }

    /** Takes a pick back as far as `scope` reaches, the reach a view names for the pick. */
    unpickScoped(id: string, scope: PickScope): PickOutcome {
        switch (scope) {
            case "element":
                return this.unpick(id);
            case "withContents":
                return this.unpickWithContents(id);
            case "withConnections":
                return this.unpickWithConnections(id);
        }
    }

    pick(id: string, side: MergeSide): PickOutcome {
        this.requireElement(id);
        const outcome = this.apply([id], side);
        if (!outcome.applied) return outcome;
        const { connections, boundaryEvents } = this.removedWithLeftOut(id, side);
        return {
            ...outcome,
            ...(connections.length === 0 ? {} : { connectionsLeftOut: connections }),
            ...(boundaryEvents.length === 0 ? {} : { boundaryEventsLeftOut: boundaryEvents }),
        };
    }

    /** The container and every descendant in either version, as one pick. */
    pickWithContents(id: string, side: MergeSide): PickOutcome {
        this.requireElement(id);
        return this.apply([id, ...descendantsOf(id, this.mergeResult.elements)], side);
    }

    /** The connections of `removedWithLeftOut`. */
    connectionsLeftOut(id: string, side: MergeSide): readonly string[] {
        return this.removedWithLeftOut(id, side).connections;
    }

    /**
     * What `side` keeps of an element the other side removed, which the other side removed with it and a pick of the
     * element would leave out: the connections and boundary events of `removedWith`, as long as nobody decided them
     * and whatever else they need stays in the result, so keeping them brings back nothing the user did not pick.
     * A connection of a boundary event comes only with its event. Empty when the other side kept the element, or
     * when the pick is refused.
     */
    removedWithLeftOut(id: string, side: MergeSide): RemovedWithLeftOut {
        const element = this.requireElement(id);
        const candidates = removedWith(this.mergeResult.elements, element, side);
        if (candidates.connections.length === 0 && candidates.boundaryEvents.length === 0) {
            return NOTHING_LEFT_OUT;
        }
        const trial = closePicks(this.index, this.sides, this.picksWith([id], side));
        if (!trial.outcome.applied) return NOTHING_LEFT_OUT;
        const after = trial.after;
        const dangling = findDanglingConflicts(this.mergeResult.elements, this.index, after);
        const inResult = (candidate: string) =>
            !dangling.has(candidate) && after.isPresent(candidate);
        const leftOut = (candidate: MergeElement) =>
            this.sides.isAutomatic(candidate.id) &&
            after.isAutomatic(candidate.id) &&
            !inResult(candidate.id);
        const boundaryEvents = candidates.boundaryEvents
            .filter(
                (event) =>
                    leftOut(event) &&
                    requirementsOf(event, side).every(
                        ({ target }) => target === id || inResult(target),
                    ),
            )
            .map((event) => event.id);
        const keptTogether = new Set([id, ...boundaryEvents]);
        const connections = candidates.connections
            .filter(
                (connection) =>
                    leftOut(connection) &&
                    otherEndsOf(connection, id, side).every(
                        (end) => keptTogether.has(end) || inResult(end),
                    ),
            )
            .map((connection) => connection.id);
        return { connections, boundaryEvents };
    }

    /** The element and its `removedWithLeftOut`, as one pick. */
    pickWithConnections(id: string, side: MergeSide): PickOutcome {
        const { connections, boundaryEvents } = this.removedWithLeftOut(id, side);
        return this.apply([id, ...boundaryEvents, ...connections], side);
    }

    /**
     * Takes back the element's pick and the picks of what the other side removed with it on its side
     * (`removedWith`), as `pickWithConnections` made them: their picks would otherwise keep the element as a
     * consequence.
     */
    unpickWithConnections(id: string): PickOutcome {
        const element = this.requireElement(id);
        const side = this.sides.picks.get(id);
        if (side === undefined) return NOTHING_DECIDED;
        const removed = idsRemovedWith(this.mergeResult.elements, element, side).filter(
            (removedId) => this.sides.picks.get(removedId) === side,
        );
        return this.take(closeUnpick(this.index, this.sides, [id, ...removed]));
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
