export type SearchStatus = "searching" | "done" | "failed";

export const DEFINITION_SEARCH_TEXTS = {
    label: "Search other models",
    placeholder: "Name or code",
    thrownBy: "thrown by {elements}",
    caughtBy: "caught by {elements}",
} as const;

/** What the result list says while it has no result to show. */
export const SEARCH_STATUS_HINTS: Readonly<Record<SearchStatus, string>> = {
    searching: "Searching…",
    done: "No matches in other models",
    failed: "Search failed",
};

/** Every key the definition search passes to translate(). */
export const DEFINITION_SEARCH_KEYS: readonly string[] = [
    ...Object.values(DEFINITION_SEARCH_TEXTS),
    ...Object.values(SEARCH_STATUS_HINTS),
];
