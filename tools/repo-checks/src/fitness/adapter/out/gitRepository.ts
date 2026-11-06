import { realpathSync, statSync } from "node:fs";

import { GitCommitHistory } from "../../../history/adapter/out/gitCommitHistory";
import type { Rename } from "../../domain/delta";
import type { RepositoryHistory } from "../../port/RepositoryHistory";
import { git, gitSucceeds, lines } from "./git";

export class GitRepository implements RepositoryHistory {
    private readonly commitHistory = new GitCommitHistory();

    constructor(private readonly repoRoot: string) {}

    headCommit(): string {
        return git(this.repoRoot, ["rev-parse", "HEAD"]).trim();
    }

    hasUncommittedChanges(): boolean {
        return git(this.repoRoot, ["status", "--porcelain"]).trim() !== "";
    }

    mergeBase(ref: string): string {
        if (!gitSucceeds(this.repoRoot, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`])) {
            throw new Error(`${ref} does not exist; fetch it first (git fetch origin)`);
        }
        try {
            return git(this.repoRoot, ["merge-base", "HEAD", ref]).trim();
        } catch {
            const shallow = git(this.repoRoot, ["rev-parse", "--is-shallow-repository"]).trim() === "true";
            throw new Error(
                shallow
                    ? `HEAD and ${ref} share no commit in this shallow clone; run git fetch --unshallow`
                    : `HEAD and ${ref} share no commit`,
            );
        }
    }

    firstParentCommits(ref: string, depth: number): readonly string[] {
        return lines(git(this.repoRoot, ["rev-list", "--first-parent", `--max-count=${depth}`, ref]));
    }

    renamesSince(commit: string): readonly Rename[] {
        return this.commitHistory
            .changesSince(this.repoRoot, commit)
            .flatMap((change) =>
                change.kind === "renamed"
                    ? [{ previousPath: change.previousPath, path: change.path }]
                    : [],
            );
    }
}

/** The real path of `dir`, which must be the root of a checkout or of a worktree. */
export function checkoutRoot(dir: string): string {
    if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
        throw new Error(`${dir} is no directory`);
    }
    let root: string;
    try {
        // Git prints forward slashes on Windows too; the real path makes both sides comparable.
        root = realpathSync(git(dir, ["rev-parse", "--show-toplevel"]).trim());
    } catch {
        throw new Error(`${dir} is not a git checkout`);
    }
    if (root !== realpathSync(dir)) {
        throw new Error(`${dir} is not the root of a checkout; its root is ${root}`);
    }
    return root;
}
