import { describe, expect, it } from "vitest";

import {
    fakeFitnessFunction,
    finding,
    InMemoryCheckout,
    InMemoryHistory,
    InMemorySnapshots,
    InMemorySnapshotWriter,
    WORKING_TREE,
} from "../__fixtures__/inMemoryPorts";
import { type FitnessFunction, InsufficientHistory } from "../domain/fitnessFunction";
import { emptySnapshot, type Snapshot, withEntry } from "../domain/snapshot";
import { type BackfillLimits, recordSnapshots } from "./snapshotService";

const COMMITS = ["c4", "c3", "c2", "c1"];

function record(
    functions: readonly FitnessFunction[],
    {
        stored = [],
        limits = { depth: 10, commitsPerRun: 10 },
        uncommittedChanges = false,
    }: { stored?: Snapshot[]; limits?: BackfillLimits; uncommittedChanges?: boolean } = {},
) {
    const checkout = new InMemoryCheckout();
    const writer = new InMemorySnapshotWriter();
    const returned = recordSnapshots(
        functions,
        {
            repoRoot: WORKING_TREE,
            history: new InMemoryHistory(COMMITS, "c1", uncommittedChanges),
            snapshots: new InMemorySnapshots(stored),
            checkout,
            writer,
        },
        limits,
    );
    return { checkout, written: writer.written, returned };
}

const coupling = fakeFitnessFunction(
    {
        [WORKING_TREE]: [finding("head")],
        "/checkout/c3": [finding("c3")],
        "/checkout/c2": [finding("c2")],
        "/checkout/c1": [finding("c1")],
    },
    { id: "coupling", version: 1 },
);

describe("recording snapshots on main", () => {
    it("measures HEAD on the working tree, then older commits on checkouts, newest first", () => {
        const { checkout, written, returned } = record([coupling]);

        expect(written.map(({ commit, entries }) => [commit, entries.coupling])).toEqual([
            ["c4", { version: 1, findings: [finding("head")] }],
            ["c3", { version: 1, findings: [finding("c3")] }],
            ["c2", { version: 1, findings: [finding("c2")] }],
            ["c1", { version: 1, findings: [finding("c1")] }],
        ]);
        expect(checkout.checkedOut).toEqual(["c3", "c2", "c1"]);
        expect(returned).toEqual(written);
    });

    it.each([
        {
            case: "commits per run",
            limits: { depth: 10, commitsPerRun: 2 },
            expected: ["c4", "c3"],
        },
        { case: "depth", limits: { depth: 3, commitsPerRun: 10 }, expected: ["c4", "c3", "c2"] },
    ])("stops at the limit of $case", ({ limits, expected }) => {
        expect(record([coupling], { limits }).written.map(({ commit }) => commit)).toEqual(
            expected,
        );
    });

    it("measures only what a stored snapshot lacks and keeps its other entries", () => {
        const other = withEntry(emptySnapshot("c3"), "cohesion", { version: 1, findings: [] });
        const storedCurrent = (commit: string) =>
            withEntry(emptySnapshot(commit), "coupling", { version: 1, findings: [] });

        const { written } = record([coupling], {
            stored: [
                storedCurrent("c4"),
                withEntry(other, "coupling", { version: 7, findings: [] }),
                storedCurrent("c2"),
                storedCurrent("c1"),
            ],
        });

        expect(written).toEqual([
            withEntry(other, "coupling", { version: 1, findings: [finding("c3")] }),
        ]);
    });

    it("ends a series at the commit git cannot recompute", () => {
        const mutation = fakeFitnessFunction(
            {},
            {
                id: "mutation",
                findFindings: ({ commit }) => {
                    if (commit === "c3") {
                        throw new InsufficientHistory("no mutation run stored before c4");
                    }
                    return [];
                },
            },
        );

        const { written } = record([mutation]);

        expect(written.map(({ commit, entries }) => [commit, entries.mutation])).toEqual([
            ["c4", { version: 2, findings: [] }],
            ["c3", { version: 2, unmeasurable: "no mutation run stored before c4" }],
        ]);
    });

    it("refuses a working tree with uncommitted changes", () => {
        expect(() => record([coupling], { uncommittedChanges: true })).toThrow(
            "the working tree has uncommitted changes",
        );
    });

    it("writes nothing without fitness functions", () => {
        expect(record([]).written).toEqual([]);
    });
});
