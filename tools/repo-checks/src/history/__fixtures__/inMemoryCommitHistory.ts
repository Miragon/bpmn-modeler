import type { CommitRecord } from "../domain/commitHistory";
import type { CommitHistory } from "../port/CommitHistory";

export class InMemoryCommitHistory implements CommitHistory {
    readonly requests: { repoRoot: string; commit: string; depth: number }[] = [];

    constructor(private readonly records: readonly CommitRecord[]) {}

    firstParentCommits(repoRoot: string, commit: string, depth: number): readonly CommitRecord[] {
        this.requests.push({ repoRoot, commit, depth });
        return this.records.slice(0, depth);
    }
}
