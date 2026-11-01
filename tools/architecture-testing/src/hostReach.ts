import type { ImportGraph } from "./importGraph";

/** `vscode` and the Node platform; `path` and `Buffer` exist in any Node host. */
export function isHostModule(specifier: string): boolean {
    return (
        specifier === "vscode" ||
        specifier.startsWith("node:") ||
        specifier === "fs" ||
        specifier.startsWith("fs/") ||
        specifier === "http" ||
        specifier === "https"
    );
}

/** Files that import a target specifier themselves or through any chain of resolved imports. */
export function filesReaching(
    graph: ImportGraph,
    isTargetSpecifier: (specifier: string) => boolean,
): Set<string> {
    const importersByFile = new Map<string, string[]>();
    const reaching = new Set<string>();
    for (const { from, specifier, to } of graph.edges) {
        if (isTargetSpecifier(specifier)) {
            reaching.add(from);
        }
        if (to !== undefined) {
            importersByFile.set(to, [...(importersByFile.get(to) ?? []), from]);
        }
    }
    const pending = [...reaching];
    while (pending.length > 0) {
        for (const importer of importersByFile.get(pending.pop()!) ?? []) {
            if (!reaching.has(importer)) {
                reaching.add(importer);
                pending.push(importer);
            }
        }
    }
    return reaching;
}
