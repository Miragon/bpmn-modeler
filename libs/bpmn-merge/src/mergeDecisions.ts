import {
    HAND_MERGE_APPLIED,
    type HandMergedVersion,
    type HandMergeOutcome,
    handMergeRefused,
} from "./handMerge";
import { closePicks } from "./mergeDecisionsClosure";
import { descendantsOf } from "./mergeDecisionsContainment";
import { findDanglingConflicts, type DanglingConflict } from "./mergeDecisionsDangling";
import { layoutSidesOf } from "./mergeDecisionsLayout";
import { DecidedSides } from "./mergeDecisionsSides";
import type { HandMergeOptions, PickOutcome, PickScope, RemovedWithLeftOut } from "./pickOutcome";
import {
    isConflictState,
    type ConflictState,
    type ElementReference,
    type ElementVersion,
    type MergeElement,
    type MergeResult,
    type MergeSide,
} from "./mergeResult";
import {
    dependentsByTarget,
    isEdgeEnd,
    isHostReference,
    isProcessReference,
    type ReferenceIndex,
    requirementsOf,
} from "./referenceRules";
import { idsRemovedWith, removedWith } from "./removedWith";
import type { UnmetRequirement } from "./unmetRequirement";

export type {
    BlockedPick,
    HandMergeOptions,
    PickOutcome,
    PickScope,
    RemovedWithLeftOut,
} from "./pickOutcome";

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

/** What the decisions read: the result with each hand-merged version in place of its side's. */
interface EffectiveElements {
    readonly result: MergeResult;
    readonly index: ReferenceIndex;
}

/**
 * The decisions of one merge: automatic resolutions, the user's picks, the
 * versions merged by hand and what keeps the result free of dangling
 * references. A hand-merged version stands only while its element stays
 * picked on its side.
 */
export class MergeDecisions {
    private sides: DecidedSides;
    private dangling: ReadonlyMap<string, DanglingConflict>;
    private handMerges: ReadonlyMap<string, HandMergedVersion> = new Map();
    private effective: EffectiveElements;

    private constructor(private readonly mergeResult: MergeResult) {
        this.effective = effectiveElementsOf(mergeResult, this.handMerges);
        this.sides = DecidedSides.automatic(this.index.elementsById);
        this.dangling = this.findDangling();
    }

    static from(result: MergeResult): MergeDecisions {
        return new MergeDecisions(result);
    }

    /** The result with each hand-merged version in place of its side's, so every reader of it follows the hand merges. */
    get result(): MergeResult {
        return this.effective.result;
    }

    get openConflicts(): readonly OpenConflict[] {
        return this.elements.flatMap((element) => {
            const conflict = this.openConflictOf(element);
            return conflict === undefined ? [] : [conflict];
        });
    }

    get canBuild(): boolean {
        return this.elements.every((element) => this.openConflictOf(element) === undefined);
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
    pickScoped(
        id: string,
        side: MergeSide,
        scope: PickScope,
        options?: HandMergeOptions,
    ): PickOutcome {
        switch (scope) {
            case "element":
                return this.pick(id, side, options);
            case "withContents":
                return this.pickWithContents(id, side, options);
            case "withRemoved":
                return this.pickWithRemoved(id, side, options);
        }
    }

    /** Takes a pick back as far as `scope` reaches, the reach a view names for the pick. */
    unpickScoped(id: string, scope: PickScope, options?: HandMergeOptions): PickOutcome {
        switch (scope) {
            case "element":
                return this.unpick(id, options);
            case "withContents":
                return this.unpickWithContents(id, options);
            case "withRemoved":
                return this.unpickWithRemoved(id, options);
        }
    }

    /**
     * Every pick and unpick that would move an element merged by hand off its
     * side drops the hand-merged version: without `dropHandMerges` it changes
     * nothing and names those elements instead.
     */
    pick(id: string, side: MergeSide, options?: HandMergeOptions): PickOutcome {
        this.requireElement(id);
        const outcome = this.apply([id], side, options);
        if (!outcome.applied) return outcome;
        const { connections, boundaryEvents } = this.removedWithLeftOut(id, side);
        return {
            ...outcome,
            ...(connections.length === 0 ? {} : { connectionsLeftOut: connections }),
            ...(boundaryEvents.length === 0 ? {} : { boundaryEventsLeftOut: boundaryEvents }),
        };
    }

    /** The container and every descendant in either version, as one pick. */
    pickWithContents(id: string, side: MergeSide, options?: HandMergeOptions): PickOutcome {
        this.requireElement(id);
        return this.apply([id, ...descendantsOf(id, this.elements)], side, options);
    }

    /**
     * What `side` keeps of an element the other side removed, which the other side removed with it and a pick of the
     * element would leave out: the connections and boundary events of `removedWith`, as long as nobody decided them
     * and everything they require besides the element stays in the result, so keeping them brings back nothing the
     * user did not pick. A connection of a boundary event comes only with its event. Empty when the other side kept
     * the element, or when the pick is refused.
     */
    removedWithLeftOut(id: string, side: MergeSide): RemovedWithLeftOut {
        const element = this.requireElement(id);
        const candidates = removedWith(this.elements, element, side);
        if (candidates.connections.length === 0 && candidates.boundaryEvents.length === 0) {
            return NOTHING_LEFT_OUT;
        }
        const trial = closePicks(this.index, this.sides, this.picksWith([id], side));
        if (!trial.outcome.applied) return NOTHING_LEFT_OUT;
        const after = trial.after;
        const dangling = findDanglingConflicts(this.elements, this.index, after);
        const inResult = (candidate: string) =>
            !dangling.has(candidate) && after.isPresent(candidate);
        const leftOut = (candidate: MergeElement) =>
            this.sides.isAutomatic(candidate.id) &&
            after.isAutomatic(candidate.id) &&
            !inResult(candidate.id);
        const offerable = (candidate: MergeElement, keptTogether: ReadonlySet<string>) =>
            leftOut(candidate) &&
            requirementsOf(candidate, side).every(
                ({ target }) => keptTogether.has(target) || inResult(target),
            );
        const boundaryEvents = candidates.boundaryEvents
            .filter((event) => offerable(event, new Set([id])))
            .map((event) => event.id);
        const keptTogether = new Set([id, ...boundaryEvents]);
        const connections = candidates.connections
            .filter((connection) => offerable(connection, keptTogether))
            .map((connection) => connection.id);
        return { connections, boundaryEvents };
    }

    /** The element and its `removedWithLeftOut`, as one pick. */
    pickWithRemoved(id: string, side: MergeSide, options?: HandMergeOptions): PickOutcome {
        const { connections, boundaryEvents } = this.removedWithLeftOut(id, side);
        return this.apply([id, ...boundaryEvents, ...connections], side, options);
    }

    /**
     * Takes back the element's pick and the picks of what the other side removed with it on its side
     * (`removedWith`), as `pickWithRemoved` made them: their picks would otherwise keep the element as a
     * consequence.
     */
    unpickWithRemoved(id: string, options?: HandMergeOptions): PickOutcome {
        const element = this.requireElement(id);
        const side = this.sides.picks.get(id);
        if (side === undefined) return NOTHING_DECIDED;
        const removed = idsRemovedWith(this.elements, element, side).filter(
            (removedId) => this.sides.picks.get(removedId) === side,
        );
        return this.change(this.picksWithout([id, ...removed]), options);
    }

    /** Takes back a container's pick and the picks of everything inside it on the same side. */
    unpickWithContents(id: string, options?: HandMergeOptions): PickOutcome {
        this.requireElement(id);
        const side = this.sides.picks.get(id);
        if (side === undefined) return NOTHING_DECIDED;
        const contents = descendantsOf(id, this.elements).filter(
            (descendant) => this.sides.picks.get(descendant) === side,
        );
        return this.change(this.picksWithout([id, ...contents]), options);
    }

    /**
     * Takes the user's pick back: the element returns to its automatic resolution or to open, or stays where another
     * pick needs it. An automatic element both versions hold that it leaves unmet reopens as dangling.
     */
    unpick(id: string, options?: HandMergeOptions): PickOutcome {
        this.requireElement(id);
        if (!this.sides.isPicked(id)) return NOTHING_DECIDED;
        return this.change(this.picksWithout([id]), options);
    }

    /** The version the user merged by hand for the element, while it stands. */
    handMergeOf(id: string): HandMergedVersion | undefined {
        return this.handMerges.get(id);
    }

    /** Every version merged by hand that stands. */
    get handMergedVersions(): readonly HandMergedVersion[] {
        return [...this.handMerges.values()];
    }

    /**
     * Takes `merged` as its element's version on its side, in place of the
     * side's own, while the element stays picked there. Refused, changing
     * nothing, when the element is not picked on that side, when the version
     * moves the element (an edge end, a host, a pool's process), names an
     * element the result does not hold, or would change any other decision.
     */
    mergeByHand(merged: HandMergedVersion): HandMergeOutcome {
        this.requireElement(merged.id);
        if (this.sides.picks.get(merged.id) !== merged.side) {
            return handMergeRefused({ kind: "notHandMergeable" });
        }
        const sideVersion = this.plainVersionOf(merged.id, merged.side);
        if (sideVersion === undefined) return handMergeRefused({ kind: "notHandMergeable" });
        const moved = changedStructuralProperties(sideVersion, merged.version);
        if (moved.length > 0) {
            return handMergeRefused({ kind: "changesStructure", properties: moved });
        }
        return this.takeHandMerges(new Map(this.handMerges).set(merged.id, merged), merged.id);
    }

    /** Takes the picked side's own version back for an element merged by hand. */
    dropHandMerge(id: string): HandMergeOutcome {
        this.requireElement(id);
        if (!this.handMerges.has(id)) return HAND_MERGE_APPLIED;
        const remaining = new Map(this.handMerges);
        remaining.delete(id);
        return this.takeHandMerges(remaining, id);
    }

    resolution(): MergeResolution {
        const open = this.openConflicts;
        if (open.length > 0) {
            throw new Error(
                `The merge has open conflicts: ${open.map((conflict) => conflict.id).join(", ")}`,
            );
        }
        const elements: Record<string, MergeSide> = {};
        for (const element of this.elements) {
            elements[element.id] = this.sides.decidedSideOf(element.id) as MergeSide;
        }
        const layout = layoutSidesOf(this.elements, (id) =>
            this.sides.isPresent(id) ? elements[id] : undefined,
        );
        return { elements, layout };
    }

    private get index(): ReferenceIndex {
        return this.effective.index;
    }

    private get elements(): readonly MergeElement[] {
        return this.effective.result.elements;
    }

    private plainVersionOf(id: string, side: MergeSide): ElementVersion | undefined {
        return this.mergeResult.elements.find((element) => element.id === id)?.versions[side];
    }

    private apply(
        ids: readonly string[],
        side: MergeSide,
        options?: HandMergeOptions,
    ): PickOutcome {
        return this.change(this.picksWith(ids, side), options);
    }

    private picksWith(ids: readonly string[], side: MergeSide): Map<string, MergeSide> {
        const picks = new Map(this.sides.picks);
        ids.forEach((id) => picks.set(id, side));
        return picks;
    }

    private picksWithout(ids: readonly string[]): Map<string, MergeSide> {
        const picks = new Map(this.sides.picks);
        ids.forEach((id) => picks.delete(id));
        return picks;
    }

    /** Closes `picks` over the hand merges they keep on their side; the others are at stake. */
    private change(
        picks: ReadonlyMap<string, MergeSide>,
        { dropHandMerges = false }: HandMergeOptions = {},
    ): PickOutcome {
        const kept = new Map(
            [...this.handMerges].filter(([id, { side }]) => picks.get(id) === side),
        );
        const atStake = [...this.handMerges.keys()].filter((id) => !kept.has(id));
        const effective =
            atStake.length === 0 ? this.effective : effectiveElementsOf(this.mergeResult, kept);
        const before =
            atStake.length === 0 ? this.sides : this.sides.over(effective.index.elementsById);
        const { outcome, after } = closePicks(effective.index, before, picks);
        if (!outcome.applied) return outcome;
        if (atStake.length > 0 && !dropHandMerges) {
            return { applied: false, handMergesAtStake: atStake };
        }
        this.handMerges = kept;
        this.effective = effective;
        this.sides = after;
        this.dangling = this.findDangling();
        return atStake.length === 0 ? outcome : { ...outcome, droppedHandMerges: atStake };
    }

    /** Takes `handMerges` only when every element but `id` keeps its decision. */
    private takeHandMerges(
        handMerges: ReadonlyMap<string, HandMergedVersion>,
        id: string,
    ): HandMergeOutcome {
        const effective = effectiveElementsOf(this.mergeResult, handMerges);
        const before = this.sides.over(effective.index.elementsById);
        const element = effective.index.elementsById.get(id)!;
        const requirements = requirementsOf(element, this.sides.picks.get(id)!);
        const missing = requirements
            .filter(({ target }) => !effective.index.elementsById.has(target))
            .map(({ target }) => target);
        if (missing.length > 0) {
            return handMergeRefused({ kind: "namesMissingElement", ids: unique(missing) });
        }
        const leftOut = requirements
            .filter((requirement) => before.isUnmet(requirement))
            .map(({ target }) => target);
        if (leftOut.length > 0) {
            return handMergeRefused({ kind: "namesLeftOutElement", ids: unique(leftOut) });
        }
        const { outcome, after } = closePicks(effective.index, before, this.sides.picks);
        if (!outcome.applied) {
            return handMergeRefused({
                kind: "changesOtherDecisions",
                ids: unique(outcome.blockedBy.map((blocked) => blocked.id)),
            });
        }
        const dangling = findDanglingConflicts(effective.result.elements, effective.index, after);
        const changed = this.elements
            .map((candidate) => candidate.id)
            .filter(
                (candidate) =>
                    decisionOf(candidate, this.sides, this.dangling) !==
                    decisionOf(candidate, after, dangling),
            );
        if (changed.length > 0) {
            return handMergeRefused({ kind: "changesOtherDecisions", ids: changed });
        }
        this.handMerges = handMerges;
        this.effective = effective;
        this.sides = after;
        this.dangling = dangling;
        return HAND_MERGE_APPLIED;
    }

    private findDangling(): ReadonlyMap<string, DanglingConflict> {
        return findDanglingConflicts(this.elements, this.index, this.sides);
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

function effectiveElementsOf(
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

/** An element's side and presence, or open while it dangles, as one comparable text. */
function decisionOf(
    id: string,
    sides: DecidedSides,
    dangling: ReadonlyMap<string, DanglingConflict>,
): string {
    const side = dangling.has(id) ? undefined : sides.decidedSideOf(id);
    return side === undefined ? "open" : `${side}:${sides.isPresent(id)}`;
}

/** The references that place an element, an edge's ends, a boundary event's host and a pool's process, that differ. */
function changedStructuralProperties(before: ElementVersion, after: ElementVersion): string[] {
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

function unique(ids: readonly string[]): string[] {
    return [...new Set(ids)];
}
