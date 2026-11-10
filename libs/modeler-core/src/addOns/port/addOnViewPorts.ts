export interface AddOnViewRevealPort {
    /** Shows the host's add-ons view at these rows; false when it cannot. */
    reveal(addOnIds: readonly string[]): Promise<boolean>;
}
