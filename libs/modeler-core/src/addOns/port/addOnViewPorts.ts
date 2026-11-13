import type { AddOnDetailTarget } from "../domain/addOnDetail";

export interface AddOnViewRevealPort {
    /** Shows the host's add-ons view at these rows; false when it cannot. */
    reveal(addOnIds: readonly string[]): Promise<boolean>;
}

/** Opens an add-on's details in an editor tab, or shows them in the one that is open. */
export interface AddOnDetailPort {
    open(target: AddOnDetailTarget): void;
}

export type { AddOnDetailTarget };
