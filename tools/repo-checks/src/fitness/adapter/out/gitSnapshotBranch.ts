import { parseSnapshot, type Snapshot, snapshotPath } from "../../domain/snapshot";
import type { SnapshotReader } from "../../port/SnapshotReader";
import { git, gitBytes, gitSucceeds, lines } from "./git";

const SNAPSHOT_BRANCH_REF = "origin/fitness-history";

/** Reads the data branch as last fetched; never touches the network. */
export class GitSnapshotBranch implements SnapshotReader {
    private storedPaths: ReadonlySet<string> | undefined;

    constructor(
        private readonly repoRoot: string,
        private readonly ref = SNAPSHOT_BRANCH_REF,
    ) {}

    read(commit: string): Snapshot | undefined {
        return this.readHistory([commit]).get(commit);
    }

    // One `git cat-file --batch` for all of them: a `git show` per commit spawns 500 processes.
    readHistory(commitsNewestFirst: readonly string[]): ReadonlyMap<string, Snapshot> {
        const stored = this.listStoredPaths();
        const commits = commitsNewestFirst.filter((commit) => stored.has(snapshotPath(commit)));
        if (commits.length === 0) {
            return new Map();
        }
        const output = gitBytes(
            this.repoRoot,
            ["cat-file", "--batch"],
            commits.map((commit) => `${this.ref}:${snapshotPath(commit)}\n`).join(""),
        );
        const texts = batchContents(output, commits.length);
        return new Map(commits.map((commit, index) => [commit, parseSnapshot(commit, texts[index])]));
    }

    // One listing instead of a failing lookup per commit the branch lacks.
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

const NEWLINE = 0x0a;

/** Each object comes as `<oid> <type> <size>\n<content>\n`. */
function batchContents(output: Buffer, count: number): string[] {
    const contents: string[] = [];
    let offset = 0;
    for (let index = 0; index < count; index++) {
        const headerEnd = output.indexOf(NEWLINE, offset);
        const header = output.toString("utf8", offset, headerEnd);
        const [, type, size] = header.split(" ");
        if (type !== "blob") {
            throw new Error(`git cat-file read no snapshot blob: ${header}`);
        }
        const contentStart = headerEnd + 1;
        const contentEnd = contentStart + Number(size);
        contents.push(output.toString("utf8", contentStart, contentEnd));
        offset = contentEnd + 1;
    }
    return contents;
}
