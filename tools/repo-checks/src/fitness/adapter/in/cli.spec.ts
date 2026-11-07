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
import { type FitnessUseCases, type ReportRequest, runFitnessCli } from "./cli";

const HEAD = "1111111111111111111111111111111111111111";
const BASE = "2222222222222222222222222222222222222222";

const fake = fakeFitnessFunction({ [WORKING_TREE]: [finding("A"), finding("B")] });
const baseSnapshot: Snapshot = {
    schemaVersion: 1,
    commit: BASE,
    entries: { [fake.id]: { version: fake.version, findings: [finding("A")] } },
};

function useCases(
    functions: readonly FitnessFunction[] = [fake],
    history = new InMemoryHistory([HEAD, BASE]),
): FitnessUseCases {
    return {
        report: ({ baseRef }) =>
            createFitnessReport(functions, baseRef, {
                repoRoot: WORKING_TREE,
                history,
                snapshots: new InMemorySnapshots([baseSnapshot]),
                checkout: new InMemoryCheckout(),
            }),
        recordSnapshots: () => [baseSnapshot],
    };
}

function run(args: readonly string[], cases = useCases()) {
    const output = { out: "", error: "", files: new Map<string, string>() };
    const exitCode = runFitnessCli(args, cases, {
        out: (text) => (output.out += text),
        error: (text) => (output.error += text),
        writeFile: (path, text) => output.files.set(path, text),
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

    it.each<[readonly string[], string]>([
        [["--format", "html"], "unknown format html"],
        [["review"], "unknown command review"],
        [["snapshot"], "snapshot needs --out <dir>"],
        [
            ["snapshot", "--out", "/tmp/fitness", "--format", "json"],
            "snapshot does not take --format",
        ],
        [["--out", "/tmp/fitness"], "report does not take --out"],
        [["snapshot", "--out", "/tmp/fitness", "--base", "v1"], "snapshot does not take --base"],
        [["snapshot", "--out", "/tmp/fitness", "--repo", "/old"], "snapshot does not take --repo"],
        [["--base", ""], "--base needs a revision"],
        [["--repo", ""], "--repo needs a directory"],
        [["report", "extra"], "unexpected argument extra"],
        [["--colour"], "--colour"],
        [["--changes-only", "--format", "json"], "--changes-only prints Markdown only"],
        [
            ["snapshot", "--out", "/tmp/fitness", "--changes-only"],
            "snapshot does not take --changes-only",
        ],
        [["--head-label", "merge"], "--head-label needs --changes-only"],
        [["--changes-only", "--head-label", ""], "--head-label needs a text"],
        [
            ["--capped-out", "/tmp/c.md", "--max-characters", "100"],
            "--capped-out needs --changes-only",
        ],
        [
            ["--changes-only", "--capped-out", "/tmp/c.md"],
            "--capped-out and --max-characters go together",
        ],
        [
            ["--changes-only", "--max-characters", "100"],
            "--capped-out and --max-characters go together",
        ],
        [
            ["--changes-only", "--capped-out", "", "--max-characters", "100"],
            "--capped-out needs a file",
        ],
        ...["0", "007", "1.5", "lots", ""].map((value): [readonly string[], string] => [
            ["--changes-only", "--capped-out", "/tmp/c.md", "--max-characters", value],
            "--max-characters needs a positive integer",
        ]),
    ])("exits 2 on the usage error in %j", (args, message) => {
        const { exitCode, error } = run(args);

        expect(exitCode).toBe(2);
        expect(error).toContain(message);
        expect(error).toContain("usage: fitness");
    });

    it.each<[readonly string[], ReportRequest]>([
        [[], { baseRef: "origin/main" }],
        [["--base", "v1.2.0"], { baseRef: "v1.2.0" }],
        [
            ["report", "--repo", "/checkouts/old", "--base", "452b6440"],
            { baseRef: "452b6440", repo: "/checkouts/old" },
        ],
    ])("measures the tree and base %j names", (args, request) => {
        const requests: ReportRequest[] = [];
        const cases = useCases();

        const { exitCode } = run(args, {
            ...cases,
            report: (received) => {
                requests.push(received);
                return cases.report(received);
            },
        });

        expect(exitCode).toBe(0);
        expect(requests).toEqual([request]);
    });

    it("names the base it compared with", () => {
        const { out } = run(["--base", "v1.2.0"]);

        expect(out).toContain("its merge base with `v1.2.0`.");
        expect(JSON.parse(run(["--base", "v1.2.0", "--format", "json"]).out)).toMatchObject({
            base: { commit: BASE, ref: "v1.2.0" },
        });
    });

    it("exits 1 and names a base that is no commit", () => {
        const history = new InMemoryHistory([HEAD, BASE], BASE, false, ["origin/main"]);

        const { exitCode, out, error } = run(["--base", "no-such-rev"], useCases([fake], history));

        expect(exitCode).toBe(1);
        expect(out).toBe("");
        expect(error).toBe("fitness: no-such-rev not found\n");
    });

    it("prints only the new and resolved rows with --changes-only", () => {
        const { exitCode, out, files } = run(["--changes-only", "--base", "v1.2.0"]);

        expect(exitCode).toBe(0);
        expect(out.split("\n")[0]).toBe("<!-- fitness-changes: some -->");
        expect(out).toContain("| new | `src/B.ts:1` | B breaks the rule |");
        expect(out).not.toContain("| existing |");
        expect(out).toContain("its merge base with `v1.2.0`.");
        expect(files.size).toBe(0);
    });

    it("names HEAD by the --head-label it is given", () => {
        expect(run(["--changes-only", "--head-label", "test merge of `abc`"]).out).toContain(
            "HEAD `111111111111` (test merge of `abc`) against",
        );
    });

    it("writes the changes capped at --max-characters to --capped-out and prints them whole", () => {
        const many = fakeFitnessFunction({
            [WORKING_TREE]: Array.from({ length: 40 }, (_, index) => finding(`F${index}`)),
        });

        const { exitCode, out, files } = run(
            ["--changes-only", "--capped-out", "comment.md", "--max-characters", "2000"],
            useCases([many]),
        );

        expect(exitCode).toBe(0);
        expect(out).toContain("| new | `src/F9.ts:1` |");
        expect(out.length).toBeGreaterThan(2_000);
        const capped = files.get("comment.md") ?? "";
        expect(capped.length).toBeLessThanOrEqual(2_000);
        expect(capped).toContain("left out to fit; the job summary lists every row.");
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
