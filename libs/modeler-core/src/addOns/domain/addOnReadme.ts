import { DirectoryEntryKind } from "../../kernel/domain/directoryEntry";
import { ShownCode } from "./codeAddOnCatalog";

/** Where an add-on's or a marketplace's README is read: a folder to look in, or a cached file. */
export type ReadmePlace =
    | { readonly kind: "folder"; readonly dir: string }
    | { readonly kind: "file"; readonly path: string };

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

/** A marketplace as the catalog listed it, with the README its cache holds, if any. */
export interface MarketplaceReadme {
    readonly sourceId: string;
    readonly readmeFile?: string;
}

/**
 * By the id the view knows, so a view only names what the core showed and
 * never a path of its own. A plugin and a rule package are folders.
 */
export function readmePlacesOf(
    shown: ReadonlyMap<string, ShownCode>,
    marketplaces: readonly MarketplaceReadme[],
): ReadonlyMap<string, ReadmePlace> {
    const places = new Map<string, ReadmePlace>();
    shown.forEach(({ id }, addOnId) => places.set(addOnId, { kind: "folder", dir: id }));
    marketplaces.forEach(({ sourceId, readmeFile }) => {
        if (readmeFile !== undefined) places.set(sourceId, { kind: "file", path: readmeFile });
    });
    return places;
}
