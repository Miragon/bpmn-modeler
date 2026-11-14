export type PickOutcome =
    | {
          readonly applied: true;
          readonly pulledIn: readonly string[];
          readonly dropped: readonly string[];
      }
    | {
          readonly applied: false;
          readonly blockedBy: readonly { readonly id: string; readonly reason: string }[];
      };
