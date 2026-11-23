import { isBuiltin } from "node:module";

import type { ImportGraph } from "./importGraph";

/** Node built-ins that are string arithmetic every Node host has, not a host capability. */
export const PORTABLE_NODE_MODULES: readonly string[] = ["path", "node:path"];

const ELECTRON = /^electron(\/|$)/;

/** A module a host provides: `vscode`, `electron` or a Node built-in that is not portable. */
export function isHostModule(specifier: string): boolean {
    return (
        specifier === "vscode" ||
        ELECTRON.test(specifier) ||
        (isBuiltin(specifier) && !PORTABLE_NODE_MODULES.includes(specifier))
    );
}

/** A module only a platform provides: a host module or a portable Node built-in. */
export function isPlatformModule(specifier: string): boolean {
    return isHostModule(specifier) || isBuiltin(specifier);
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
