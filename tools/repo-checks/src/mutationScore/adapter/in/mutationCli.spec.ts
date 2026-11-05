import { describe, expect, it } from "vitest";

import type { MutationRun } from "../../domain/mutationRun";
import { type MutationUseCases, runMutationCli } from "./mutationCli";

const RECORDED: MutationRun = { schemaVersion: 1, runId: "7", commit: "abc", contexts: {} };

function run(args: readonly string[], overrides: Partial<MutationUseCases> = {}) {
    const calls: unknown[] = [];
    const output = { out: "", error: "" };
    const exitCode = runMutationCli(
        args,
        {
            record: (recorded) => {
                calls.push(recorded);
                return RECORDED;
            },
            summary: (reportPath) => `summary of ${reportPath}\n`,
            ...overrides,
        },
        { out: (text) => (output.out += text), error: (text) => (output.error += text) },
    );
    return { exitCode, calls, ...output };
}

describe("the mutation command", () => {
    it("records a run", () => {
        const result = run([
            "record",
            "--report",
            "r.json",
            "--commit",
            "abc",
            "--run",
            "7",
            "--out",
            "/tmp/out",
        ]);

        expect(result).toMatchObject({
            exitCode: 0,
            out: "Recorded run 7 at abc\n",
            calls: [{ reportPath: "r.json", commit: "abc", runId: "7", outDir: "/tmp/out" }],
        });
    });

    it("prints the summary of a report", () => {
        expect(run(["summary", "--report", "r.json"])).toMatchObject({
            exitCode: 0,
            out: "summary of r.json\n",
        });
    });

    it.each([
        { case: "no command", args: [], problem: "needs record or summary" },
        { case: "an unknown command", args: ["store"], problem: "unknown command store" },
        { case: "an extra argument", args: ["summary", "x"], problem: "unexpected argument x" },
        { case: "an unknown option", args: ["summary", "--force"], problem: "Unknown option" },
        {
            case: "a record without --run",
            args: ["record", "--report", "r", "--commit", "c", "--out", "o"],
            problem: "needs --run",
        },
        { case: "a summary without --report", args: ["summary"], problem: "needs --report" },
        {
            case: "a summary with --out",
            args: ["summary", "--report", "r", "--out", "o"],
            problem: "summary does not take --out",
        },
    ])("is a usage error with $case", ({ args, problem }) => {
        const result = run(args);

        expect(result.exitCode).toBe(2);
        expect(result.error).toContain(problem);
        expect(result.error).toContain("usage: fitness mutation record");
    });

    it("exits 1 on broken input", () => {
        const result = run(["summary", "--report", "r.json"], {
            summary: () => {
                throw new Error("the Stryker report has no files");
            },
        });

        expect(result).toMatchObject({
            exitCode: 1,
            error: "fitness mutation: the Stryker report has no files\n",
        });
    });
});
