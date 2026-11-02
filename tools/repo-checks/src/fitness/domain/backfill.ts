import type { FitnessFunction } from "./fitnessFunction";
import { type Snapshot, usableEntry } from "./snapshot";

/** About two months of `main` at the pace of late 2026. */
export const BACKFILL_DEPTH = 500;
export const BACKFILL_COMMITS_PER_RUN = 100;

export interface BackfillStep {
    readonly commit: string;
    readonly functions: readonly FitnessFunction[];
}

// Newest first, so HEAD is measured before any backfill. Behind an unmeasurable
// commit git cannot recompute older ones either, so the series ends there.
export function nextBackfillStep(
    commitsNewestFirst: readonly string[],
    snapshots: ReadonlyMap<string, Snapshot>,
    functions: readonly FitnessFunction[],
): BackfillStep | undefined {
    const endedSeries = new Set<string>();
    for (const commit of commitsNewestFirst) {
        const snapshot = snapshots.get(commit);
        const due = functions.filter(
            (fitnessFunction) =>
                !endedSeries.has(fitnessFunction.id) &&
                usableEntry(snapshot, fitnessFunction) === undefined,
        );
        if (due.length > 0) {
            return { commit, functions: due };
        }
        for (const fitnessFunction of functions) {
            const entry = usableEntry(snapshot, fitnessFunction);
            if (entry !== undefined && "unmeasurable" in entry) {
                endedSeries.add(fitnessFunction.id);
            }
        }
    }
    return undefined;
}
