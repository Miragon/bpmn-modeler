import type { ImportGraph } from "./importGraph";
import type { Violation } from "./knownExceptions";

export interface ArchitectureRule {
    readonly rule: string;
    /** Paths relative to the source root; `to` is a path when the import resolves, else its specifier. */
    readonly violations: (graph: ImportGraph) => Violation[];
}
