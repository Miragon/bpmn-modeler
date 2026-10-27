/**
 * Outcome of searching the workspace for the files a reference names.
 *
 * - `no-search-scope` — nothing to search: no workspace folder open and no
 *   source URI to fall back to.
 * - `all-unreadable` — the search returned candidates but every read failed.
 * - `matches` — candidates were searched. `paths` may be empty (nothing
 *   matched), or contain one or more absolute paths.
 */
export type LocateResult =
    | { kind: "no-search-scope" }
    | { kind: "all-unreadable"; attempted: number; failures: string[] }
    | { kind: "matches"; paths: string[]; readFailures: string[] };

export type LocatedFile =
    | { kind: "noScope" }
    | { kind: "unreadable"; failures: readonly string[] }
    | { kind: "notFound"; readFailures: readonly string[] }
    | { kind: "single"; path: string; readFailures: readonly string[] }
    | { kind: "ambiguous"; paths: readonly string[]; readFailures: readonly string[] };

export function classifyLocateResult(result: LocateResult): LocatedFile {
    void result;
    return { kind: "noScope" };
}
