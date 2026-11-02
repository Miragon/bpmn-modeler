import { parseSnapshot, type Snapshot, snapshotPath } from "../../domain/snapshot";
import type { SnapshotReader } from "../../port/SnapshotReader";
import { git, gitSucceeds, lines } from "./git";

const SNAPSHOT_BRANCH_REF = "origin/fitness-history";

/** Reads the data branch as last fetched; never touches the network. */
export class GitSnapshotBranch implements SnapshotReader {
    private storedPaths: ReadonlySet<string> | undefined;

    constructor(
        private readonly repoRoot: string,
        private readonly ref = SNAPSHOT_BRANCH_REF,
    ) {}

    read(commit: string): Snapshot | undefined {
        const path = snapshotPath(commit);
        if (!this.listStoredPaths().has(path)) {
            return undefined;
        }
        return parseSnapshot(commit, git(this.repoRoot, ["show", `${this.ref}:${path}`]));
    }

    // One listing instead of a failing `git show` per commit the branch lacks.
    private listStoredPaths(): ReadonlySet<string> {
        if (this.storedPaths === undefined) {
            const exists = gitSucceeds(this.repoRoot, [
                "rev-parse",
                "--verify",
                "--quiet",
                `${this.ref}^{commit}`,
            ]);
            this.storedPaths = new Set(
                exists
                    ? lines(git(this.repoRoot, ["ls-tree", "--name-only", this.ref, "snapshots/"]))
                    : [],
            );
        }
        return this.storedPaths;
    }
}
