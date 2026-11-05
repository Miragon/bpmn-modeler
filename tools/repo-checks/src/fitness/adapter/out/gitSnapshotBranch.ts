import { parseSnapshot, type Snapshot, snapshotPath } from "../../domain/snapshot";
import type { SnapshotReader } from "../../port/SnapshotReader";
import { listBranchFiles, readBlobs } from "./git";

export const FITNESS_HISTORY_REF = "origin/fitness-history";

/** Reads the data branch as last fetched; never touches the network. */
export class GitSnapshotBranch implements SnapshotReader {
    private storedPaths: ReadonlySet<string> | undefined;

    constructor(
        private readonly repoRoot: string,
        private readonly ref = FITNESS_HISTORY_REF,
    ) {}

    read(commit: string): Snapshot | undefined {
        return this.readHistory([commit]).get(commit);
    }

    readHistory(commitsNewestFirst: readonly string[]): ReadonlyMap<string, Snapshot> {
        this.storedPaths ??= new Set(listBranchFiles(this.repoRoot, this.ref, "snapshots"));
        const stored = this.storedPaths;
        const commits = commitsNewestFirst.filter((commit) => stored.has(snapshotPath(commit)));
        const texts = readBlobs(
            this.repoRoot,
            commits.map((commit) => `${this.ref}:${snapshotPath(commit)}`),
        );
        return new Map(commits.map((commit, index) => [commit, parseSnapshot(commit, texts[index])]));
    }
}
