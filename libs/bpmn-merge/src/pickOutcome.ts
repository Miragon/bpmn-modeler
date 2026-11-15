import type { UnmetRequirement } from "./unmetRequirement";

/** How far a pick reaches, and so what Undo takes back with it. */
export type PickScope = "element" | "withContents" | "withConnections";

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
          /** Set on a pick, only when not empty: the flows `connectionsLeftOut` names, which `pickWithConnections` keeps too. */
          readonly connectionsLeftOut?: readonly string[];
      }
    | {
          readonly applied: false;
          readonly blockedBy: readonly BlockedPick[];
      };
