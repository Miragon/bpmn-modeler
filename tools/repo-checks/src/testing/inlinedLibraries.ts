function libraryDirectories(sourceRoots: readonly string[]): string[] {
    return sourceRoots.map((sourceRoot) => {
        const directory = /^\.\.\/\.\.\/libs\/([^/]+)\/src$/.exec(sourceRoot)?.[1];
        if (!directory) {
            throw new Error(`unexpected inlined library source root ${sourceRoot}`);
        }
        return directory;
    });
}

/** The `libs/` folders an npm package's `inlined-libraries.json` lists. */
export function inlinedLibraries(inlinedLibrariesJson: string): string[] {
    const libraries = JSON.parse(inlinedLibrariesJson) as { sourceRoot: string }[];
    return libraryDirectories(libraries.map(({ sourceRoot }) => sourceRoot));
}
