import { BACKFILL_COMMITS_PER_RUN, BACKFILL_DEPTH, nextBackfillStep } from "../domain/backfill";
import type { FitnessFunction } from "../domain/fitnessFunction";
import { emptySnapshot, type Snapshot, withEntry } from "../domain/snapshot";
import type { RepositoryHistory } from "../port/RepositoryHistory";
import type { SnapshotReader } from "../port/SnapshotReader";
import type { SnapshotWriter } from "../port/SnapshotWriter";
import type { TreeCheckout } from "../port/TreeCheckout";
import { measure } from "./measurement";

export interface SnapshotPorts {
    readonly repoRoot: string;
    readonly history: RepositoryHistory;
    readonly snapshots: SnapshotReader;
    readonly checkout: TreeCheckout;
    readonly writer: SnapshotWriter;
}

export interface BackfillLimits {
    readonly depth: number;
    readonly commitsPerRun: number;
}

export function recordSnapshots(
    functions: readonly FitnessFunction[],
    ports: SnapshotPorts,
    limits: BackfillLimits = { depth: BACKFILL_DEPTH, commitsPerRun: BACKFILL_COMMITS_PER_RUN },
): readonly Snapshot[] {
    if (ports.history.hasUncommittedChanges()) {
        throw new Error("the working tree has uncommitted changes; a snapshot belongs to a commit");
    }
    const headCommit = ports.history.headCommit();
    const commits = ports.history.firstParentCommits("HEAD", limits.depth);
    const snapshots = new Map<string, Snapshot>();
    for (const commit of commits) {
        const stored = ports.snapshots.read(commit);
        if (stored !== undefined) {
            snapshots.set(commit, stored);
        }
    }

    const written: Snapshot[] = [];
    for (let run = 0; run < limits.commitsPerRun; run++) {
        const step = nextBackfillStep(commits, snapshots, functions);
        if (step === undefined) {
            break;
        }
        const measureStep = (root: string): Snapshot =>
            step.functions.reduce(
                (snapshot, fitnessFunction) =>
                    withEntry(snapshot, fitnessFunction.id, {
                        version: fitnessFunction.version,
                        ...measure(fitnessFunction, { repoRoot: root, commit: step.commit }),
                    }),
                snapshots.get(step.commit) ?? emptySnapshot(step.commit),
            );
        const snapshot =
            step.commit === headCommit
                ? measureStep(ports.repoRoot)
                : ports.checkout.withTreeAt(step.commit, measureStep);
        snapshots.set(step.commit, snapshot);
        ports.writer.write(snapshot);
        written.push(snapshot);
    }
    return written;
}
