import {
    closePicks,
    closeUnpick,
    type ClosedDecisions,
    type PickContext,
} from "./mergeDecisionsClosure";
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
import { dependentsByTarget } from "./referenceRules";

export type { PickOutcome } from "./pickOutcome";

export interface OpenConflict {
    readonly id: string;
    readonly state: ConflictState | "danglingReference";
    /** For danglingReference: the elements and reference that broke it. */
    readonly reason?: string;
    readonly related: readonly string[];
}

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
        private readonly context: PickContext,
    ) {
        this.sides = DecidedSides.automatic(context.elementsById);
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

    sideOf(id: string): MergeSide | undefined {
        return this.dangling.has(id) ? undefined : this.sides.sideOf(id);
    }

    isInResult(id: string): boolean | undefined {
        const side = this.sideOf(id);
        return side === undefined
            ? undefined
            : this.context.elementsById.get(id)?.versions[side] !== undefined;
    }

    pick(id: string, side: MergeSide): PickOutcome {
        this.requireElement(id);
        return this.apply(new Map([[id, side]]));
    }

    /** The container and every descendant in either version, as one pick. */
    pickWithContents(id: string, side: MergeSide): PickOutcome {
        this.requireElement(id);
        const ids = [id, ...descendantsOf(id, this.mergeResult.elements)];
        return this.apply(new Map(ids.map((picked) => [picked, side])));
    }

    /** Takes the user's pick back: the element returns to its automatic resolution or to open. */
    unpick(id: string): PickOutcome {
        this.requireElement(id);
        if (!this.sides.isPicked(id)) {
            return { applied: true, pulledIn: [], dropped: [] };
        }
        return this.take(closeUnpick(this.context, this.sides, id));
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
            elements[element.id] = this.sides.sideOf(element.id) as MergeSide;
        }
        const layout = layoutSidesOf(this.mergeResult.elements, (id) => {
            const side = elements[id];
            return this.context.elementsById.get(id)?.versions[side] === undefined
                ? undefined
                : side;
        });
        return { elements, layout };
    }

    private apply(picks: ReadonlyMap<string, MergeSide>): PickOutcome {
        return this.take(closePicks(this.context, this.sides, picks));
    }

    private take({ outcome, after }: ClosedDecisions): PickOutcome {
        this.sides = after;
        this.dangling = this.findDangling();
        return outcome;
    }

    private findDangling(): ReadonlyMap<string, DanglingConflict> {
        return findDanglingConflicts(
            this.mergeResult.elements,
            this.context.elementsById,
            this.sides,
        );
    }

    private openConflictOf(element: MergeElement): OpenConflict | undefined {
        const dangling = this.dangling.get(element.id);
        if (dangling !== undefined) {
            return {
                id: element.id,
                state: "danglingReference",
                reason: dangling.reason,
                related: dangling.related,
            };
        }
        if (this.sides.sideOf(element.id) === undefined && isConflictState(element.state)) {
            return { id: element.id, state: element.state, related: [] };
        }
        return undefined;
    }

    private requireElement(id: string): void {
        if (!this.context.elementsById.has(id)) {
            throw new Error(`The merge result has no element ${id}`);
        }
    }
}
