import { describe, expect, it } from "vitest";

import { fakeFitnessFunction } from "../__fixtures__/inMemoryPorts";
import { nextBackfillStep } from "./backfill";
import { emptySnapshot, type Snapshot, type SnapshotEntry, withEntry } from "./snapshot";

const coupling = fakeFitnessFunction({}, { id: "coupling", version: 2 });
const mutation = fakeFitnessFunction({}, { id: "mutation", version: 1 });
const COMMITS = ["c3", "c2", "c1"];

function stored(entries: Record<string, Record<string, SnapshotEntry>>): Map<string, Snapshot> {
    return new Map(
        Object.entries(entries).map(([commit, byId]) => [
            commit,
            Object.entries(byId).reduce(
                (snapshot, [id, entry]) => withEntry(snapshot, id, entry),
                emptySnapshot(commit),
            ),
        ]),
    );
}

const measured = (version: number): SnapshotEntry => ({ version, findings: [] });
const unmeasurable = (version: number): SnapshotEntry => ({ version, unmeasurable: "no history" });

function step(snapshots: Map<string, Snapshot>) {
    const next = nextBackfillStep(COMMITS, snapshots, [coupling, mutation]);
    return next && `${next.commit}:${next.functions.map(({ id }) => id).join(",")}`;
}

describe("the next backfill step", () => {
    it.each<{
        case: string;
        snapshots: Record<string, Record<string, SnapshotEntry>>;
        expected: string | undefined;
    }>([
        { case: "measures HEAD first", snapshots: {}, expected: "c3:coupling,mutation" },
        {
            case: "measures only the functions a snapshot lacks",
            snapshots: { c3: { coupling: measured(2) } },
            expected: "c3:mutation",
        },
        {
            case: "goes back to the newest commit with a gap",
            snapshots: {
                c3: { coupling: measured(2), mutation: measured(1) },
                c2: { mutation: measured(1) },
            },
            expected: "c2:coupling",
        },
        {
            case: "remeasures a function stored under another version",
            snapshots: {
                c3: { coupling: measured(2), mutation: measured(1) },
                c2: { coupling: measured(1), mutation: measured(1) },
            },
            expected: "c2:coupling",
        },
        {
            case: "stops a series behind an unmeasurable commit",
            snapshots: { c3: { coupling: measured(2), mutation: unmeasurable(1) } },
            expected: "c2:coupling",
        },
        {
            case: "retries an unmeasurable entry of another version",
            snapshots: {
                c3: { coupling: measured(2), mutation: measured(1) },
                c2: { coupling: measured(2), mutation: unmeasurable(9) },
            },
            expected: "c2:mutation",
        },
        {
            case: "is done when every series is complete or ended",
            snapshots: {
                c3: { coupling: measured(2), mutation: measured(1) },
                c2: { coupling: unmeasurable(2), mutation: measured(1) },
                c1: { mutation: measured(1) },
            },
            expected: undefined,
        },
    ])("$case", ({ snapshots, expected }) => {
        expect(step(stored(snapshots))).toBe(expected);
    });
});
