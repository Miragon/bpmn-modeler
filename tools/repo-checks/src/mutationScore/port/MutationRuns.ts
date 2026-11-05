import type { MutationRun } from "../domain/mutationRun";

export interface MutationRuns {
    /** Every run stored on the data branch as last fetched. */
    storedRuns(repoRoot: string): readonly MutationRun[];
    /** The whole first-parent chain of the commit, newest first. */
    firstParentChain(repoRoot: string, commit: string): readonly string[];
}
