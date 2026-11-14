/** Markdown first, as a plain README renders as one paragraph. */
const README_NAMES = ["readme.md", "readme.markdown", "readme"] as const;

/** The README among a folder's or a repository root's file names, in any case. */
export function readmeFileNameIn(fileNames: readonly string[]): string | undefined {
    for (const wanted of README_NAMES) {
        const found = fileNames.find((name) => name.toLowerCase() === wanted);
        if (found !== undefined) return found;
    }
    return undefined;
}
