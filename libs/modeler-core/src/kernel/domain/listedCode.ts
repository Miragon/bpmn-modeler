import { Allowance, ApprovableArtifact } from "./allowance";

/** Code as its owner lists it, named even when it could not be read. */
export type ListedPresence = (
    | { readonly kind: "found"; readonly artifact: ListedCode }
    | {
          readonly kind: "unreadable";
          readonly id: string;
          readonly reason: string;
          readonly allowance: Allowance;
      }
    | { readonly kind: "gone"; readonly id: string }
) & { readonly name: string };

/** Code as its owner lists it for a review: what runs, and what else the user may want to know. */
export interface ListedCode extends ApprovableArtifact {
    readonly version?: string;
}

export function presenceIdOf(presence: ListedPresence): string {
    return presence.kind === "found" ? presence.artifact.id : presence.id;
}
