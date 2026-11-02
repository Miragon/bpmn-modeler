import { posix } from "node:path";

import { readModuleImports } from "./moduleImports";
import type { SourceFile } from "./sourceTree";

export interface ImportEdge {
    readonly from: string;
    readonly specifier: string;
    readonly typeOnly: boolean;
    /** Set when the specifier is relative and resolves to a file of the tree. */
    readonly to?: string;
}

export interface ImportGraph {
    readonly files: readonly string[];
    readonly edges: readonly ImportEdge[];
}

const RESOLUTION_SUFFIXES: readonly string[] = [".ts", ".tsx", "/index.ts", "/index.tsx", ""];

export function buildImportGraph(tree: readonly SourceFile[]): ImportGraph {
    const files = tree.map(({ path }) => path);
    const known = new Set(files);
    const edges = tree.flatMap(({ path, text }) =>
        readModuleImports(path, text).map(({ specifier, typeOnly }): ImportEdge => {
            const to = isRelative(specifier)
                ? resolveRelativeImport(path, specifier, known)
                : undefined;
            return to === undefined
                ? { from: path, specifier, typeOnly }
                : { from: path, specifier, typeOnly, to };
        }),
    );
    return { files, edges };
}

export function resolveRelativeImport(
    fromFile: string,
    specifier: string,
    known: ReadonlySet<string>,
): string | undefined {
    const base = posix.join(posix.dirname(fromFile), specifier);
    return RESOLUTION_SUFFIXES.map((suffix) => `${base}${suffix}`).find((candidate) =>
        known.has(candidate),
    );
}

/** A gap here silently drops an edge from every rule that walks the graph. */
export function unresolvedRelativeImports(
    graph: ImportGraph,
    assetExtensions: readonly string[],
): ImportEdge[] {
    return graph.edges.filter(
        ({ specifier, to }) =>
            isRelative(specifier) &&
            to === undefined &&
            !assetExtensions.some((extension) => specifier.endsWith(extension)),
    );
}

function isRelative(specifier: string): boolean {
    return specifier.startsWith(".");
}
