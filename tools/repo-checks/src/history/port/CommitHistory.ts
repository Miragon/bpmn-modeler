import type { CommitRecord, FileChange } from "../domain/commitHistory";

export interface CommitHistory {
    /** Newest first; throws when a shallow clone holds fewer than `depth`. */
    firstParentCommits(repoRoot: string, commit: string, depth: number): readonly CommitRecord[];
    /** The working tree's tracked changes against `commit`. */
    changesSince(repoRoot: string, commit: string): readonly FileChange[];
}
