import type { UnmetRequirement } from "./unmetRequirement";

/** What a pick of an element the other side removed leaves out of what the other side removed with it. */
export interface RemovedWithLeftOut {
    readonly connections: readonly string[];
    readonly boundaryEvents: readonly string[];
}

/** How far a pick reaches, and so what Undo takes back with it. */
export type PickScope = "element" | "withContents" | "withRemoved";

export interface BlockedPick {
    /** The element the rule would need this pick to change. */
    readonly id: string;
    readonly reason: UnmetRequirement;
}

export type PickOutcome =
    | {
          readonly applied: true;
          readonly pulledIn: readonly string[];
          readonly dropped: readonly string[];
          /** Set on a pick, each only when not empty: what `removedWithLeftOut` names, which `pickWithRemoved` keeps too. */
          readonly connectionsLeftOut?: readonly string[];
          readonly boundaryEventsLeftOut?: readonly string[];
      }
    | {
          readonly applied: false;
          readonly blockedBy: readonly BlockedPick[];
      };
