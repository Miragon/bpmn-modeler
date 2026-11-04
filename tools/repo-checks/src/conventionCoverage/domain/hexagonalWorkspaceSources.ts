import type { ClassImplementation, ImportGraph } from "@miragon/architecture-testing";

export interface HexagonalWorkspaceSources {
    /** POSIX path relative to the repo root. */
    readonly dir: string;
    /** Paths relative to the workspace's `src/`, as the role-folder rules read them. */
    readonly graph: ImportGraph;
    /** Paths relative to the repo root: the implemented port may sit in another workspace. */
    readonly implementations: readonly ClassImplementation[];
}
