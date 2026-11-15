/** A commit as Git names it: its full hash and the first line of its message. */
export interface GitCommitFact {
    readonly hash: string;
    readonly subject: string;
}

/**
 * The refs a Git host resolved for a repository, raw: each absent when it does
 * not resolve. The domain decides what they mean (`gitOperationOf`).
 */
export interface GitRefFacts {
    /** The checked-out branch; absent on a detached HEAD, as during a rebase. */
    readonly headName?: string;
    readonly head?: GitCommitFact;
    readonly rebaseHead?: GitCommitFact;
    /** The Git extension's own rebase state, which misses a linked worktree's rebase. */
    readonly rebaseCommit?: GitCommitFact;
    readonly mergeHead?: GitCommitFact;
    readonly cherryPickHead?: GitCommitFact;
}

/** The index stages of a conflicted file; a stage Git does not hold is absent, never empty. */
export interface ConflictStages {
    readonly base?: string;
    readonly current?: string;
    readonly incoming?: string;
}

/** What a Git host read about one file, after a status refresh. */
export interface ConflictStageFacts {
    readonly gitAvailable: boolean;
    readonly inMergeChanges: boolean;
    readonly stages: ConflictStages;
    readonly refs: GitRefFacts;
    /** The working file as Git left it, with its conflict markers. */
    readonly workingText?: string;
}
