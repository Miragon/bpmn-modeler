import type { CommitRecord, FileChange } from "../domain/commitHistory";
import type { CommitHistory } from "../port/CommitHistory";

/** A base on the default branch: no change between any two commits. */
export class InMemoryCommitHistory implements CommitHistory {
    readonly requests: { repoRoot: string; commit: string; depth: number }[] = [];
    readonly changeRequests: { repoRoot: string; commit: string }[] = [];

    constructor(
        private readonly records: readonly CommitRecord[],
        private readonly change: readonly FileChange[] = [],
    ) {}

    firstParentCommits(repoRoot: string, commit: string, depth: number): readonly CommitRecord[] {
        this.requests.push({ repoRoot, commit, depth });
        return this.records.slice(0, depth);
    }

    changesSince(repoRoot: string, commit: string): readonly FileChange[] {
        this.changeRequests.push({ repoRoot, commit });
        return this.change;
    }

    changesBetween(): readonly FileChange[] {
        return [];
    }
}
