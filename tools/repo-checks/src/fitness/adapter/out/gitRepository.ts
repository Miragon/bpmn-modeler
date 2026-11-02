import type { RepositoryHistory } from "../../port/RepositoryHistory";
import { git, gitSucceeds, lines } from "./git";

export class GitRepository implements RepositoryHistory {
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
}
