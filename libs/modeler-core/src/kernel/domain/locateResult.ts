import { ChoicePrompt } from "./prompts";

/**
 * Outcome of searching the workspace's files; `Matches` holds what was found.
 *
 * - `no-search-scope` — nothing to search: no workspace folder open and no
 *   source URI to fall back to.
 * - `all-unreadable` — the search returned candidates but every read failed.
 * - `matches` — candidates were searched; what was found may be empty.
 */
export type SearchOutcome<Matches extends object> =
    | { kind: "no-search-scope" }
    | { kind: "all-unreadable"; failures: string[] }
    | ({ kind: "matches"; readFailures: string[] } & Matches);

/** A search for the files a reference names, as absolute `paths`. */
export type LocateResult = SearchOutcome<{ paths: string[] }>;

/** A search whose every read failed searched nothing, which is not finding nothing. */
export function outcomeAfterReading<Matches extends object>(
    attempted: number,
    readFailures: string[],
    matches: Matches,
): SearchOutcome<Matches> {
    if (attempted > 0 && readFailures.length === attempted) {
        return { kind: "all-unreadable", failures: readFailures };
    }
    return { kind: "matches", readFailures, ...matches };
}

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

export function locatedFileChoices(
    _outcome: LocateResult,
    _choice: { placeholder: string; workspaceFolders: readonly string[] },
): ChoicePrompt<string> | undefined {
    return undefined;
}
