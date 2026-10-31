/** Icons a choice can carry; a host maps each onto its own icon set or drops it. */
export type ChoiceIcon = "swap" | "cloud";

export interface ChoiceItem<V> {
    readonly label: string;
    readonly description?: string;
    /** The file the item stands for. A host shows it in place of `description`. */
    readonly path?: string;
    readonly icon?: ChoiceIcon;
    readonly value: V;
}

/** A choice the core builds in full; the host only renders it and reports the pick. */
export interface ChoicePrompt<V> {
    /** Names the prompt independently of its text, so the test kit can answer it. */
    readonly id: string;
    readonly title?: string;
    readonly placeholder: string;
    readonly items: readonly ChoiceItem<V>[];
}

/** A modal yes/no before the core removes something on the user's behalf. */
export interface ConfirmRequest {
    readonly id: string;
    readonly title: string;
    readonly confirmLabel: string;
    /** Already summarised, so a host renders every line and shortens nothing. */
    readonly details: readonly string[];
}

/** A search the user waits on in a busy chooser, which opens only when the outcome leaves a choice. */
export interface SearchPrompt<R> {
    readonly id: string;
    readonly searchingPlaceholder: string;
    search(): Promise<R>;
    /** The choice the outcome leaves to the user, or `undefined` when it leaves none. */
    choices(outcome: R): ChoicePrompt<string> | undefined;
}
