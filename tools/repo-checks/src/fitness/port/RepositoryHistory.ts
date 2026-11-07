import type { Rename } from "../domain/delta";

export interface RepositoryHistory {
    headCommit(): string;
    hasUncommittedChanges(): boolean;
    /** Throws when the ref is missing or shares no commit with HEAD. */
    mergeBase(ref: string): string;
    /** Newest first. */
    firstParentCommits(ref: string, depth: number): readonly string[];
    /** The working tree's renames against `commit`, as git's pinned rename detection sees them. */
    renamesSince(commit: string): readonly Rename[];
}
