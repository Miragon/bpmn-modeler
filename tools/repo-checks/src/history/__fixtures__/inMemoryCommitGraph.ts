import type { CommitRecord, FileChange } from "../domain/commitHistory";
import type { CommitHistory } from "../port/CommitHistory";

/**
 * First-parent chains keyed by their tip, the working tree's change against each commit, and the
 * change between two commits keyed by `<from>..<to>`.
 */
export class InMemoryCommitGraph implements CommitHistory {
    constructor(
        private readonly chainsByTip: Readonly<Record<string, readonly CommitRecord[]>>,
        private readonly changesByBase: Readonly<Record<string, readonly FileChange[]>> = {},
        private readonly changesByRange: Readonly<Record<string, readonly FileChange[]>> = {},
    ) {}

    firstParentCommits(_repoRoot: string, commit: string, depth: number): readonly CommitRecord[] {
        const chain = this.chainsByTip[commit];
        if (chain === undefined) {
            throw new Error(`no chain ends at ${commit}`);
        }
        return chain.slice(0, depth);
    }

    changesSince(_repoRoot: string, commit: string): readonly FileChange[] {
        return this.changesByBase[commit] ?? [];
    }

    changesBetween(_repoRoot: string, from: string, to: string): readonly FileChange[] {
        return this.changesByRange[`${from}..${to}`] ?? [];
    }
}
