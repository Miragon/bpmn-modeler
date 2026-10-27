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
    | { kind: "all-unreadable"; failures: string[] }
    | { kind: "matches"; paths: string[]; readFailures: string[] };

/** What a {@link LocateResult} leaves to do: tell the user, open the file, or let them pick. */
export type LocatedFile =
    | { kind: "noScope" }
    | { kind: "unreadable"; failures: readonly string[] }
    | { kind: "notFound"; readFailures: readonly string[] }
    | { kind: "single"; path: string; readFailures: readonly string[] }
    | { kind: "ambiguous"; paths: readonly string[]; readFailures: readonly string[] };

export function classifyLocateResult(result: LocateResult): LocatedFile {
    if (result.kind === "no-search-scope") {
        return { kind: "noScope" };
    }
    if (result.kind === "all-unreadable") {
        return { kind: "unreadable", failures: result.failures };
    }
    const { paths, readFailures } = result;
    if (paths.length === 0) {
        return { kind: "notFound", readFailures };
    }
    if (paths.length === 1) {
        return { kind: "single", path: paths[0], readFailures };
    }
    return { kind: "ambiguous", paths, readFailures };
}
