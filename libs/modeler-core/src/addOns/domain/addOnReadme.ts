import { DirectoryEntryKind } from "../../kernel/domain/directoryEntry";

/** What a detail shows below the core's facts; Markdown as its author wrote it, never rendered here. */
export type AddOnReadme =
    | { readonly kind: "shown"; readonly markdown: string; readonly truncated: boolean }
    | { readonly kind: "none" }
    | { readonly kind: "unreadable"; readonly text: string };

export const NO_README: AddOnReadme = { kind: "none" };

/** Every view gets the README in one message, so a huge one must not stall the page. */
export const README_MAX_LENGTH = 200_000;

/** Markdown first, as a plain README renders as one paragraph. */
const README_NAMES = ["readme.md", "readme.markdown", "readme"] as const;

export function readmeFileNameIn(
    entries: readonly (readonly [string, DirectoryEntryKind])[],
): string | undefined {
    const files = entries.filter(([, kind]) => kind === "file").map(([name]) => name);
    for (const wanted of README_NAMES) {
        const found = files.find((name) => name.toLowerCase() === wanted);
        if (found !== undefined) return found;
    }
    return undefined;
}

export function readmeOf(text: string): AddOnReadme {
    if (text.trim() === "") return NO_README;
    const truncated = text.length > README_MAX_LENGTH;
    return {
        kind: "shown",
        markdown: truncated ? text.slice(0, README_MAX_LENGTH) : text,
        truncated,
    };
}
