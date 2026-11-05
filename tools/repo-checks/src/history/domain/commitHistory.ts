/** First-parent commits, one squash-merged PR each; a count, not a date, as the older history's dates were rewritten. */
export const HISTORY_WINDOW = 924;
/** The commit after the window proves its oldest commit has a parent to diff against. */
export const HISTORY_WINDOW_READ_DEPTH = HISTORY_WINDOW + 1;

export type FileChange =
    | { readonly kind: "added" | "modified" | "deleted"; readonly path: string }
    | { readonly kind: "renamed"; readonly path: string; readonly previousPath: string };

export interface CommitRecord {
    readonly commit: string;
    readonly subject: string;
    readonly changes: readonly FileChange[];
}

export interface Changeset {
    readonly commit: string;
    readonly subject: string;
    /** Sorted; a file that no longer exists is dropped. */
    readonly paths: readonly string[];
}

/**
 * Each change resolves against the paths as they stood after its commit. Rename
 * sources are mapped last, so a swap or a path re-added in the same commit
 * keeps the right history.
 */
export function changesetsAtTodaysPaths(
    commitsNewestFirst: readonly CommitRecord[],
    todaysFiles: Iterable<string>,
): Changeset[] {
    const todaysPathOf = new Map([...todaysFiles].map((path) => [path, path]));
    return commitsNewestFirst.map(({ commit, subject, changes }) => {
        const paths = new Set<string>();
        const renameSources: [string, string][] = [];
        for (const change of changes) {
            const todaysPath = todaysPathOf.get(change.path);
            if (todaysPath !== undefined) {
                paths.add(todaysPath);
                if (change.kind === "renamed") {
                    renameSources.push([change.previousPath, todaysPath]);
                }
            }
        }
        for (const change of changes) {
            if (change.kind === "added" || change.kind === "renamed") {
                todaysPathOf.delete(change.path);
            }
        }
        for (const [previousPath, todaysPath] of renameSources) {
            todaysPathOf.set(previousPath, todaysPath);
        }
        return { commit, subject, paths: [...paths].sort() };
    });
}

export type HistoryWindow =
    | { readonly kind: "window"; readonly commits: readonly CommitRecord[] }
    | { readonly kind: "tooShort"; readonly reason: string };

export function historyWindow(commitsNewestFirst: readonly CommitRecord[]): HistoryWindow {
    if (commitsNewestFirst.length < HISTORY_WINDOW_READ_DEPTH) {
        return {
            kind: "tooShort",
            reason: `${commitsNewestFirst.length} first-parent commits reach back from here; the window needs ${HISTORY_WINDOW} and the parent of the oldest`,
        };
    }
    return { kind: "window", commits: commitsNewestFirst.slice(0, HISTORY_WINDOW) };
}

// Release, dependency and formatting commits touch many files for no shared reason.
const MECHANICAL_SUBJECT = /^(chore\((deps|main|format)\)|style(\([^)]*\))?)!?:/;

export function isMechanicalCommit(subject: string): boolean {
    return MECHANICAL_SUBJECT.test(subject);
}
