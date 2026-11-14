/** What a detail shows below the core's facts; Markdown as its author wrote it, never rendered here. */
export type AddOnReadme =
    | { readonly kind: "shown"; readonly markdown: string; readonly truncated: boolean }
    | { readonly kind: "none" }
    | { readonly kind: "unreadable"; readonly text: string };

export const NO_README: AddOnReadme = { kind: "none" };

/** Every view gets the README in one message, so a huge one must not stall the page. */
export const README_MAX_LENGTH = 200_000;

export function readmeOf(text: string): AddOnReadme {
    if (text.trim() === "") return NO_README;
    const truncated = text.length > README_MAX_LENGTH;
    return {
        kind: "shown",
        markdown: truncated ? text.slice(0, README_MAX_LENGTH) : text,
        truncated,
    };
}
