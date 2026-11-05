import { describe, expect, it } from "vitest";

import {
    InMemoryMutationRunWriter,
    InMemoryStrykerReports,
} from "../__fixtures__/inMemoryMutationPorts";
import { recordMutationRun, summarizeMutationReport } from "./mutationRunService";

const REPORT = {
    files: {
        "src/kernel/domain/a.ts": { mutants: [{ status: "Killed" }, { status: "Survived" }] },
    },
};

describe("recording a mutation run", () => {
    it("writes the tallies of the workflow's report under its run id", () => {
        const writer = new InMemoryMutationRunWriter();

        recordMutationRun(new InMemoryStrykerReports({ "r.json": REPORT }), writer, {
            reportPath: "r.json",
            commit: "abc",
            runId: "7",
        });

        expect(writer.written).toEqual([
            {
                schemaVersion: 1,
                runId: "7",
                commit: "abc",
                contexts: { "libs/modeler-core/src/kernel/domain": { detected: 1, undetected: 1 } },
            },
        ]);
    });

    it("fails without a report", () => {
        expect(() =>
            recordMutationRun(new InMemoryStrykerReports({}), new InMemoryMutationRunWriter(), {
                reportPath: "r.json",
                commit: "abc",
                runId: "7",
            }),
        ).toThrow("no Stryker report at r.json");
    });
});

describe("summarizing a mutation report", () => {
    it("tables the report", () => {
        expect(
            summarizeMutationReport(new InMemoryStrykerReports({ "r.json": REPORT }), "r.json"),
        ).toContain("| kernel | 50.0% | 1 | 1 |");
    });

    it("says when the run wrote no report", () => {
        expect(summarizeMutationReport(new InMemoryStrykerReports({}), "r.json")).toBe(
            "No mutation report at `r.json`.\n",
        );
    });
});
