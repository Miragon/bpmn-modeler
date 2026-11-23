import type { MergeSide } from "../../kernel/domain/mergeResult";
import type { UnmetRequirement } from "./unmetRequirement";

/** What a pick of an element the other side removed leaves out of what the other side removed with it. */
export interface RemovedWithLeftOut {
    readonly connections: readonly string[];
    readonly boundaryEvents: readonly string[];
}

/** How far a pick reaches, and so what Undo takes back with it. */
export type PickScope = "element" | "withContents" | "withRemoved";

/** A pick of a side or the undo of a pick, as far as its scope reaches. */
export type ScopedDecision =
    | {
          readonly kind: "pick";
          readonly id: string;
          readonly side: MergeSide;
          readonly scope: PickScope;
          readonly options?: HandMergeOptions;
      }
    | {
          readonly kind: "unpick";
          readonly id: string;
          readonly scope: PickScope;
          readonly options?: HandMergeOptions;
      };

export interface BlockedPick {
    /** The element the rule would need this pick to change. */
    readonly id: string;
    readonly reason: UnmetRequirement;
}

/** Whether a pick or an unpick may drop the versions merged by hand of the elements it moves off their side. */
export interface HandMergeOptions {
    readonly dropHandMerges?: boolean;
}

/** What closing the picks gives: applied, or blocked by the elements it would have to change. */
export type ClosedPickOutcome =
    | {
          readonly applied: true;
          readonly pulledIn: readonly string[];
          readonly dropped: readonly string[];
          /** Set on a pick, each only when not empty: what `removedWithLeftOut` names, which `pickWithRemoved` keeps too. */
          readonly connectionsLeftOut?: readonly string[];
          readonly boundaryEventsLeftOut?: readonly string[];
          /** The elements whose hand-merged version the call dropped, when any. */
          readonly droppedHandMerges?: readonly string[];
      }
    | {
          readonly applied: false;
          readonly blockedBy: readonly BlockedPick[];
      };

export type PickOutcome =
    | ClosedPickOutcome
    | {
          readonly applied: false;
          /** The elements merged by hand the call would move off their side; it changed nothing. */
          readonly handMergesAtStake: readonly string[];
      };

/** Whether the call changed nothing to ask before it drops versions merged by hand, rather than being blocked or applied. */
export function asksToDropHandMerges(
    outcome: PickOutcome,
): outcome is Extract<PickOutcome, { readonly handMergesAtStake: readonly string[] }> {
    return "handMergesAtStake" in outcome;
}
