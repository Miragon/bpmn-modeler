import { readClassDeclarations } from "./classDeclarations";
import type { ImportGraph } from "./importGraph";
import type { Violation } from "./knownExceptions";
import type { SourceFile } from "./sourceTree";

export interface PortAdapterViolations {
    readonly misplacedAdapters: readonly string[];
    /** Imports of an adapter from outside its homes, where the port should be taken instead. */
    readonly adapterImporters: readonly Violation[];
}

/** Files declaring a class that implements an interface named `*Port`. */
export function findPortAdapters(tree: readonly SourceFile[]): Set<string> {
    return new Set(
        tree
            .filter(({ path, text }) =>
                readClassDeclarations(path, text).some(({ implementedInterfaces }) =>
                    implementedInterfaces.some((name) => name.endsWith("Port")),
                ),
            )
            .map(({ path }) => path),
    );
}

export function portAdapterViolations(
    adapters: ReadonlySet<string>,
    graph: ImportGraph,
    isAdapterHome: (path: string) => boolean,
): PortAdapterViolations {
    const reportedPairs = new Set<string>();
    const adapterImporters: Violation[] = [];
    for (const { from, to } of graph.edges) {
        // An adapter's edge to itself is no importer; a misplaced adapter is reported by placement.
        if (to === undefined || to === from || !adapters.has(to) || isAdapterHome(from)) {
            continue;
        }
        const pair = `${from}\n${to}`;
        if (!reportedPairs.has(pair)) {
            reportedPairs.add(pair);
            adapterImporters.push({ from, to });
        }
    }
    return {
        misplacedAdapters: [...adapters].filter((adapter) => !isAdapterHome(adapter)),
        adapterImporters,
    };
}
