import { describe, expect, it } from "vitest";

import {
    fakeFitnessFunction,
    finding,
    InMemoryCheckout,
    InMemoryHistory,
    InMemorySnapshots,
    WORKING_TREE,
} from "../__fixtures__/inMemoryPorts";
import { InsufficientHistory, type MeasurementContext } from "../domain/fitnessFunction";
import { createFitnessReport } from "./fitnessReportService";

const HEAD = "head000";
const BASE = "base000";

describe("the fitness report", () => {
    it("marks a finding the merge-base snapshot holds as existing and the rest as new", () => {
        const fake = fakeFitnessFunction({ [WORKING_TREE]: [finding("A", 7), finding("B")] });
        const checkout = new InMemoryCheckout();

        const report = createFitnessReport([fake], "origin/main", {
            repoRoot: WORKING_TREE,
            history: new InMemoryHistory([HEAD, BASE]),
            snapshots: new InMemorySnapshots([
                {
                    schemaVersion: 1,
                    commit: BASE,
                    entries: { [fake.id]: { version: fake.version, findings: [finding("A", 3)] } },
                },
            ]),
            checkout,
        });

        expect(report.functions[0]).toMatchObject({
            base: { source: "snapshot" },
            outcome: {
                kind: "measured",
                findings: [
                    { ...finding("A", 7), status: "existing" },
                    { ...finding("B"), status: "new" },
                ],
                resolved: [],
            },
        });
        expect(checkout.checkedOut).toEqual([]);
    });

    it("measures the merge base on a checkout when its snapshot holds another version", () => {
        const fake = fakeFitnessFunction({
            [WORKING_TREE]: [finding("A"), finding("B")],
            [`/checkout/${BASE}`]: [finding("B")],
        });
        const checkout = new InMemoryCheckout();

        const report = createFitnessReport([fake], "origin/main", {
            repoRoot: WORKING_TREE,
            history: new InMemoryHistory([HEAD, BASE]),
            snapshots: new InMemorySnapshots([
                {
                    schemaVersion: 1,
                    commit: BASE,
                    entries: { [fake.id]: { version: fake.version - 1, findings: [finding("A")] } },
                },
            ]),
            checkout,
        });

        expect(report.functions[0]).toMatchObject({
            base: { source: "checkout" },
            outcome: {
                findings: [
                    { key: "A", status: "new" },
                    { key: "B", status: "existing" },
                ],
            },
        });
        expect(checkout.checkedOut).toEqual([BASE]);
    });
});

describe("the fitness report across renamed files", () => {
    it("keeps a finding existing whose file the working tree renamed since the merge base", () => {
        const renamed = {
            key: "src/b.ts — Save",
            path: "src/b.ts",
            line: 4,
            message: "`Save`",
            paths: ["src/b.ts"],
        };
        const fake = fakeFitnessFunction({ [WORKING_TREE]: [renamed] });
        const history = new InMemoryHistory([HEAD, BASE]).withRenamesSince(BASE, [
            { previousPath: "src/a.ts", path: "src/b.ts" },
        ]);

        const report = createFitnessReport([fake], "origin/main", {
            repoRoot: WORKING_TREE,
            history,
            snapshots: new InMemorySnapshots([
                {
                    schemaVersion: 1,
                    commit: BASE,
                    entries: {
                        [fake.id]: {
                            version: fake.version,
                            findings: [{ ...renamed, key: "src/a.ts — Save", path: "src/a.ts" }],
                        },
                    },
                },
            ]),
            checkout: new InMemoryCheckout(),
        });

        expect(report.functions[0].outcome).toEqual({
            kind: "measured",
            findings: [
                {
                    key: "src/b.ts — Save",
                    path: "src/b.ts",
                    line: 4,
                    message: "`Save`",
                    status: "existing",
                },
            ],
            resolved: [],
        });
    });
});

describe("the change the fitness report measures", () => {
    it("measures HEAD against the merge base and the merge base against itself", () => {
        const contexts: MeasurementContext[] = [];
        const recording = fakeFitnessFunction(
            {},
            {
                findFindings: (context) => {
                    contexts.push(context);
                    return [];
                },
            },
        );

        createFitnessReport([recording], "origin/main", {
            repoRoot: WORKING_TREE,
            history: new InMemoryHistory([HEAD, BASE]),
            snapshots: new InMemorySnapshots(),
            checkout: new InMemoryCheckout(),
        });

        expect(contexts).toEqual([
            { repoRoot: WORKING_TREE, commit: HEAD, changeBase: BASE },
            { repoRoot: `/checkout/${BASE}`, commit: BASE, changeBase: BASE },
        ]);
    });
});

describe("the base the fitness report compares with", () => {
    it("compares with the merge base of the ref it is given and names that ref", () => {
        const fake = fakeFitnessFunction({
            [WORKING_TREE]: [finding("A"), finding("B")],
            [`/checkout/${BASE}`]: [finding("A")],
        });
        const checkout = new InMemoryCheckout();

        const report = createFitnessReport([fake], "452b6440", {
            repoRoot: WORKING_TREE,
            history: new InMemoryHistory([HEAD, BASE], BASE, false, ["452b6440"]),
            snapshots: new InMemorySnapshots(),
            checkout,
        });

        expect(report.base).toEqual({ commit: BASE, ref: "452b6440" });
        expect(checkout.checkedOut).toEqual([BASE]);
        expect(report.functions[0].outcome).toMatchObject({
            findings: [
                { key: "A", status: "existing" },
                { key: "B", status: "new" },
            ],
        });
    });

    it("measures the tree it is given at HEAD", () => {
        const roots: string[] = [];
        const recording = fakeFitnessFunction(
            {},
            {
                findFindings: ({ repoRoot }) => {
                    roots.push(repoRoot);
                    return [];
                },
            },
        );

        createFitnessReport([recording], "origin/main", {
            repoRoot: "/checkouts/old",
            history: new InMemoryHistory([HEAD, BASE]),
            snapshots: new InMemorySnapshots(),
            checkout: new InMemoryCheckout(),
        });

        expect(roots).toEqual(["/checkouts/old", `/checkout/${BASE}`]);
    });

    it("reports a function that cannot measure an old tree beside the ones that can", () => {
        const kinds = fakeFitnessFunction(
            {},
            {
                id: "kinds",
                findFindings: () => {
                    throw new InsufficientHistory("no workspace declares a kind");
                },
            },
        );
        const sizes = fakeFitnessFunction({ [WORKING_TREE]: [finding("A")] }, { id: "sizes" });

        const report = createFitnessReport([kinds, sizes], "452b6440", {
            repoRoot: WORKING_TREE,
            history: new InMemoryHistory([HEAD, BASE]),
            snapshots: new InMemorySnapshots(),
            checkout: new InMemoryCheckout(),
        });

        expect(
            report.functions.map(({ id, base, outcome }) => ({ id, base, kind: outcome.kind })),
        ).toEqual([
            {
                id: "kinds",
                base: { source: "checkout", unmeasurable: "no workspace declares a kind" },
                kind: "unmeasurable",
            },
            { id: "sizes", base: { source: "checkout" }, kind: "measured" },
        ]);
    });
});

describe("the trend in the fitness report", () => {
    const measured = (codeLines: number) => ({ ...finding("A"), values: { codeLines } });
    const sized = fakeFitnessFunction(
        { [WORKING_TREE]: [measured(348)] },
        { id: "size", values: [{ id: "codeLines", title: "code lines" }] },
    );
    const stored = (commit: string, codeLines: number) => ({
        schemaVersion: 1 as const,
        commit,
        entries: { size: { version: sized.version, findings: [measured(codeLines)] } },
    });

    it("follows a value over the stored snapshots of the merge base's first-parent chain", () => {
        const snapshots = new InMemorySnapshots([stored(BASE, 330), stored("c1", 300)]);

        const report = createFitnessReport([sized], "origin/main", {
            repoRoot: WORKING_TREE,
            history: new InMemoryHistory([HEAD, BASE, "c1"], BASE),
            snapshots,
            checkout: new InMemoryCheckout(),
        });

        expect(report.functions[0].outcome).toMatchObject({
            findings: [
                {
                    trend: [
                        { commit: "c1", values: { codeLines: 300 } },
                        { commit: BASE, values: { codeLines: 330 } },
                        { commit: HEAD, values: { codeLines: 348 } },
                    ],
                },
            ],
        });
        expect(snapshots.historyReads).toEqual([[BASE, "c1"]]);
    });

    it("reads no history when no function declares values", () => {
        const snapshots = new InMemorySnapshots([stored(BASE, 330)]);

        createFitnessReport([fakeFitnessFunction({})], "origin/main", {
            repoRoot: WORKING_TREE,
            history: new InMemoryHistory([HEAD, BASE]),
            snapshots,
            checkout: new InMemoryCheckout(),
        });

        expect(snapshots.historyReads).toEqual([]);
    });
});

describe("the fitness report on broken input", () => {
    it("checks out the merge base once for every function without a usable snapshot", () => {
        const checkout = new InMemoryCheckout();
        const coupling = fakeFitnessFunction({}, { id: "coupling" });
        const cohesion = fakeFitnessFunction({}, { id: "cohesion" });

        createFitnessReport([coupling, cohesion], "origin/main", {
            repoRoot: WORKING_TREE,
            history: new InMemoryHistory([HEAD, BASE]),
            snapshots: new InMemorySnapshots(),
            checkout,
        });

        expect(checkout.checkedOut).toEqual([BASE]);
    });

    it("records a function that cannot measure HEAD as unmeasurable", () => {
        const mutation = fakeFitnessFunction(
            {},
            {
                findFindings: ({ repoRoot }) => {
                    if (repoRoot === WORKING_TREE) {
                        throw new InsufficientHistory("no mutation run at HEAD");
                    }
                    return [];
                },
            },
        );

        const report = createFitnessReport([mutation], "origin/main", {
            repoRoot: WORKING_TREE,
            history: new InMemoryHistory([HEAD, BASE], BASE, true),
            snapshots: new InMemorySnapshots(),
            checkout: new InMemoryCheckout(),
        });

        expect(report.head).toEqual({ commit: HEAD, uncommittedChanges: true });
        expect(report.functions[0].outcome).toEqual({
            kind: "unmeasurable",
            reason: "no mutation run at HEAD",
        });
    });

    it.each([
        {
            case: "a function throws",
            findFindings: () => {
                throw new Error("cannot parse src/a.ts");
            },
            problem: `fitness function fake-coupling at ${HEAD} failed: cannot parse src/a.ts`,
        },
        {
            case: "a function returns a broken finding",
            findFindings: () => [{ ...finding("A"), line: 0 }],
            problem: `fitness function fake-coupling at ${HEAD}: finding 0 has line 0`,
        },
    ])("fails when $case", ({ findFindings, problem }) => {
        expect(() =>
            createFitnessReport([fakeFitnessFunction({}, { findFindings })], "origin/main", {
                repoRoot: WORKING_TREE,
                history: new InMemoryHistory([HEAD, BASE]),
                snapshots: new InMemorySnapshots(),
                checkout: new InMemoryCheckout(),
            }),
        ).toThrow(problem);
    });

    it("fails without a merge base", () => {
        expect(() =>
            createFitnessReport([], "origin/main", {
                repoRoot: WORKING_TREE,
                history: new InMemoryHistory([HEAD], null),
                snapshots: new InMemorySnapshots(),
                checkout: new InMemoryCheckout(),
            }),
        ).toThrow("origin/main not found");
    });
});
