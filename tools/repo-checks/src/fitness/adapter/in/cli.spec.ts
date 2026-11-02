import { describe, expect, it } from "vitest";

import {
    fakeFitnessFunction,
    finding,
    InMemoryCheckout,
    InMemoryHistory,
    InMemorySnapshots,
    WORKING_TREE,
} from "../../__fixtures__/inMemoryPorts";
import type { FitnessFunction } from "../../domain/fitnessFunction";
import type { Snapshot } from "../../domain/snapshot";
import { createFitnessReport } from "../../service/fitnessReportService";
import { type FitnessUseCases, runFitnessCli } from "./cli";

const HEAD = "1111111111111111111111111111111111111111";
const BASE = "2222222222222222222222222222222222222222";

const fake = fakeFitnessFunction({ [WORKING_TREE]: [finding("A"), finding("B")] });
const baseSnapshot: Snapshot = {
    schemaVersion: 1,
    commit: BASE,
    entries: { [fake.id]: { version: fake.version, findings: [finding("A")] } },
};

function useCases(functions: readonly FitnessFunction[] = [fake]): FitnessUseCases {
    return {
        report: () =>
            createFitnessReport(functions, "origin/main", {
                repoRoot: WORKING_TREE,
                history: new InMemoryHistory([HEAD, BASE]),
                snapshots: new InMemorySnapshots([baseSnapshot]),
                checkout: new InMemoryCheckout(),
            }),
        recordSnapshots: () => [baseSnapshot],
    };
}

function run(args: readonly string[], cases = useCases()) {
    const output = { out: "", error: "" };
    const exitCode = runFitnessCli(args, cases, {
        out: (text) => (output.out += text),
        error: (text) => (output.error += text),
    });
    return { exitCode, ...output };
}

const LIMIT_TEXTS = [
    fake.measures,
    fake.reliesOn.rule,
    fake.reliesOn.skill,
    ...fake.misses,
    ...fake.reportsWrongly,
    "Tornhill, Your Code as a Crime Scene",
    "50 of 200 PRs",
    "holistic",
    "triggered",
    "static",
];

describe("the fitness command", () => {
    it("exits 0 although a finding is new", () => {
        const { exitCode, out, error } = run([]);

        expect(exitCode).toBe(0);
        expect(error).toBe("");
        expect(out).toContain("| new | `src/B.ts:1` | B breaks the rule |");
        expect(out).toContain("| existing | `src/A.ts:1` | A breaks the rule |");
    });

    it.each(LIMIT_TEXTS)("prints the limit %s in Markdown and in JSON", (text) => {
        expect(run(["report", "--format", "markdown"]).out).toContain(text);
        expect(run(["--format", "json"]).out).toContain(JSON.stringify(text));
    });

    it("prints the same findings in both formats", () => {
        const json = JSON.parse(run(["--format", "json"]).out) as {
            functions: {
                version: number;
                outcome: { findings: { key: string; status: string }[] };
            }[];
        };
        const markdown = run([]).out;

        expect(json.functions[0].version).toBe(fake.version);
        expect(markdown).toContain(`version ${fake.version}`);
        expect(
            json.functions[0].outcome.findings.map(({ key, status }) => `${status}:${key}`),
        ).toEqual(["existing:A", "new:B"]);
        expect(markdown.match(/^\| (new|existing) \| `src\/\w/gm)).toEqual([
            "| existing | `src/A",
            "| new | `src/B",
        ]);
    });

    it("prints a report without fitness functions", () => {
        expect(run([], useCases([])).out).toContain("No fitness function is registered.");
    });

    it("exits 1 with the message when the input is broken", () => {
        const broken = fakeFitnessFunction(
            {},
            {
                findFindings: () => {
                    throw new Error("cannot read the tree");
                },
            },
        );

        const { exitCode, out, error } = run([], useCases([broken]));

        expect(exitCode).toBe(1);
        expect(out).toBe("");
        expect(error).toContain("cannot read the tree");
    });

    it.each([
        [["--format", "html"], "unknown format html"],
        [["review"], "unknown command review"],
        [["snapshot"], "snapshot needs --out <dir>"],
        [
            ["snapshot", "--out", "/tmp/fitness", "--format", "json"],
            "snapshot does not take --format",
        ],
        [["--out", "/tmp/fitness"], "report does not take --out"],
        [["report", "extra"], "unexpected argument extra"],
        [["--colour"], "--colour"],
    ])("exits 2 on the usage error in %j", (args, message) => {
        const { exitCode, error } = run(args);

        expect(exitCode).toBe(2);
        expect(error).toContain(message);
        expect(error).toContain("usage: fitness");
    });

    it("names every snapshot it wrote", () => {
        expect(run(["snapshot", "--out", "/tmp/fitness"])).toMatchObject({
            exitCode: 0,
            out: `Measured ${BASE}\n`,
        });
        expect(
            run(["snapshot", "--out", "/tmp/fitness"], { ...useCases(), recordSnapshots: () => [] })
                .out,
        ).toBe("Every snapshot is up to date.\n");
    });
});
