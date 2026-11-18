function libraryDirectories(sourceRoots: readonly string[]): string[] {
    return sourceRoots.map((sourceRoot) => {
        const directory = /^\.\.\/\.\.\/libs\/([^/]+)\/src$/.exec(sourceRoot)?.[1];
        if (!directory) {
            throw new Error(`unexpected inlined library source root ${sourceRoot}`);
        }
        return directory;
    });
}

/** The `libs/` folders listed in `packages/bpmn-modeler/inlined-libraries.json`. */
export function bpmnInlinedLibraries(inlinedLibrariesJson: string): string[] {
    const libraries = JSON.parse(inlinedLibrariesJson) as { sourceRoot: string }[];
    return libraryDirectories(libraries.map(({ sourceRoot }) => sourceRoot));
}

/** The `libs/` folders of `INLINED_LIB_SRC` in `packages/dmn-modeler/vite.config.mts`. */
export function dmnInlinedLibraries(viteConfig: string): string[] {
    const sourceRoots = /INLINED_LIB_SRC = \[([^\]]*)\]/.exec(viteConfig)?.[1] ?? "";
    return libraryDirectories([...sourceRoots.matchAll(/"([^"]+)"/g)].map((entry) => entry[1]));
}
