import { BACKFILL_DEPTH } from "../domain/backfill";
import { declaresValues, type FitnessFunction } from "../domain/fitnessFunction";
import { type BaseSource, type FitnessReport, functionReport } from "../domain/report";
import { type Measurement, usableEntry } from "../domain/snapshot";
import type { TrendHistory } from "../domain/trend";
import type { RepositoryHistory } from "../port/RepositoryHistory";
import type { SnapshotReader } from "../port/SnapshotReader";
import type { TreeCheckout } from "../port/TreeCheckout";
import { measure } from "./measurement";

export interface FitnessReportPorts {
    readonly repoRoot: string;
    readonly history: RepositoryHistory;
    readonly snapshots: SnapshotReader;
    readonly checkout: TreeCheckout;
}

interface BaseMeasurement {
    readonly source: BaseSource;
    readonly measurement: Measurement;
}

function measureBase(
    functions: readonly FitnessFunction[],
    baseCommit: string,
    ports: FitnessReportPorts,
): ReadonlyMap<string, BaseMeasurement> {
    const baseSnapshot = ports.snapshots.read(baseCommit);
    const byId = new Map<string, BaseMeasurement>();
    const unstored: FitnessFunction[] = [];
    for (const fitnessFunction of functions) {
        const stored = usableEntry(baseSnapshot, fitnessFunction);
        if (stored === undefined) {
            unstored.push(fitnessFunction);
        } else {
            byId.set(fitnessFunction.id, { source: "snapshot", measurement: stored });
        }
    }
    if (unstored.length > 0) {
        ports.checkout.withTreeAt(baseCommit, (root) => {
            for (const fitnessFunction of unstored) {
                byId.set(fitnessFunction.id, {
                    source: "checkout",
                    measurement: measure(fitnessFunction, {
                        repoRoot: root,
                        commit: baseCommit,
                        changeBase: baseCommit,
                    }),
                });
            }
        });
    }
    return byId;
}

function readTrendHistory(
    functions: readonly FitnessFunction[],
    headCommit: string,
    baseCommit: string,
    ports: FitnessReportPorts,
): TrendHistory | undefined {
    if (!functions.some(declaresValues)) {
        return undefined;
    }
    const commitsNewestFirst = ports.history.firstParentCommits(baseCommit, BACKFILL_DEPTH);
    return {
        headCommit,
        commitsNewestFirst,
        snapshots: ports.snapshots.readHistory(commitsNewestFirst),
    };
}

export function createFitnessReport(
    functions: readonly FitnessFunction[],
    baseRef: string,
    ports: FitnessReportPorts,
): FitnessReport {
    const headCommit = ports.history.headCommit();
    const baseCommit = ports.history.mergeBase(baseRef);
    const headById = new Map(
        functions.map((fitnessFunction) => [
            fitnessFunction.id,
            measure(fitnessFunction, {
                repoRoot: ports.repoRoot,
                commit: headCommit,
                changeBase: baseCommit,
            }),
        ]),
    );
    const baseById = measureBase(functions, baseCommit, ports);
    const renames = ports.history.renamesSince(baseCommit);
    const history = readTrendHistory(functions, headCommit, baseCommit, ports);
    return {
        head: { commit: headCommit, uncommittedChanges: ports.history.hasUncommittedChanges() },
        base: { commit: baseCommit, ref: baseRef },
        functions: functions.map((fitnessFunction) =>
            functionReport(
                fitnessFunction,
                headById.get(fitnessFunction.id) as Measurement,
                { ...(baseById.get(fitnessFunction.id) as BaseMeasurement), renames },
                history,
            ),
        ),
    };
}
