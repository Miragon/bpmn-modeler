import type { CommitRecord } from "../domain/commitHistory";

export interface CommitHistory {
    /** Newest first; throws when a shallow clone holds fewer than `depth`. */
    firstParentCommits(repoRoot: string, commit: string, depth: number): readonly CommitRecord[];
}
