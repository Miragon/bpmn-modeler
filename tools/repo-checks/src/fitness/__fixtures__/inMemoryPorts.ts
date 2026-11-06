import type { Finding } from "../domain/finding";
import type { FitnessFunction, MeasurementContext } from "../domain/fitnessFunction";
import type { Snapshot } from "../domain/snapshot";
import type { RepositoryHistory } from "../port/RepositoryHistory";
import type { SnapshotReader } from "../port/SnapshotReader";
import type { SnapshotWriter } from "../port/SnapshotWriter";
import type { TreeCheckout } from "../port/TreeCheckout";

export const WORKING_TREE = "/repo";

export class InMemoryHistory implements RepositoryHistory {
    constructor(
        private readonly commits: readonly string[],
        private readonly base: string | null = commits.at(-1) ?? null,
        private readonly uncommittedChanges = false,
        /** The refs a merge base is found for; every ref when left out. */
        private readonly refs?: readonly string[],
    ) {}

    headCommit(): string {
        return this.commits[0];
    }

    hasUncommittedChanges(): boolean {
        return this.uncommittedChanges;
    }

    mergeBase(ref: string): string {
        if (this.base === null || (this.refs !== undefined && !this.refs.includes(ref))) {
            throw new Error(`${ref} not found`);
        }
        return this.base;
    }

    /** Starts at `ref` when it is one of the commits, at HEAD otherwise. */
    firstParentCommits(ref: string, depth: number): readonly string[] {
        const start = Math.max(this.commits.indexOf(ref), 0);
        return this.commits.slice(start, start + depth);
    }
}

export class InMemorySnapshots implements SnapshotReader {
    readonly historyReads: (readonly string[])[] = [];
    private readonly byCommit: Map<string, Snapshot>;

    constructor(snapshots: readonly Snapshot[] = []) {
        this.byCommit = new Map(snapshots.map((snapshot) => [snapshot.commit, snapshot]));
    }

    read(commit: string): Snapshot | undefined {
        return this.byCommit.get(commit);
    }

    readHistory(commitsNewestFirst: readonly string[]): ReadonlyMap<string, Snapshot> {
        this.historyReads.push(commitsNewestFirst);
        return new Map(
            commitsNewestFirst.flatMap((commit) => {
                const snapshot = this.byCommit.get(commit);
                return snapshot === undefined ? [] : [[commit, snapshot] as const];
            }),
        );
    }
}

/** A checkout's root is `/checkout/<commit>`, so a fake function can tell the trees apart. */
export class InMemoryCheckout implements TreeCheckout {
    readonly checkedOut: string[] = [];

    withTreeAt<T>(commit: string, use: (root: string) => T): T {
        this.checkedOut.push(commit);
        return use(`/checkout/${commit}`);
    }
}

export function finding(key: string, line = 1): Finding {
    return { key, path: `src/${key}.ts`, line, message: `${key} breaks the rule` };
}

export function fakeFitnessFunction(
    findingsByRoot: Readonly<Record<string, readonly Finding[]>>,
    overrides: Partial<FitnessFunction> = {},
): FitnessFunction {
    return {
        id: "fake-coupling",
        version: 2,
        categories: { scope: "holistic", cadence: "triggered", result: "static" },
        measures: "files that change together",
        reliesOn: { skill: "architecture", rule: "a feature changes in one folder" },
        misses: ["coupling through a shared file outside the feature"],
        reportsWrongly: ["a rename as a new coupling"],
        evidence: [
            { kind: "published", reference: "Tornhill, Your Code as a Crime Scene" },
            { kind: "trial", commit: "773f8014", outcome: "50 of 200 PRs" },
        ],
        findFindings: ({ repoRoot }: MeasurementContext) => findingsByRoot[repoRoot] ?? [],
        ...overrides,
    };
}

export class InMemorySnapshotWriter implements SnapshotWriter {
    readonly written: Snapshot[] = [];

    write(snapshot: Snapshot): void {
        this.written.push(snapshot);
    }
}
