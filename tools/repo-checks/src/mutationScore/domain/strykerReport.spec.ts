import { describe, expect, it } from "vitest";

import { strykerReport } from "../__fixtures__/strykerReports";
import { contextTallies, mutationRunFromStrykerReport } from "./strykerReport";

const WORKSPACE = "libs/modeler-core";
const DEPLOYMENT = "libs/modeler-core/src/deployment/domain";
const BPMN = "libs/modeler-core/src/modeler/bpmn/domain";
const DMN = "libs/modeler-core/src/modeler/dmn/domain";

describe("a mutation run from a Stryker report", () => {
    it("tallies detected and undetected mutants per domain folder, as Stryker scores them", () => {
        const report = strykerReport({
            "src/deployment/domain/target.ts": ["Killed", "Timeout", "Survived", "Ignored"],
            "src/deployment/domain/auth/token.ts": ["NoCoverage", "CompileError"],
            "src/modeler/bpmn/domain/lint.ts": ["Killed"],
            "src/modeler/dmn/domain/empty.ts": ["Ignored"],
        });

        expect(mutationRunFromStrykerReport(report, WORKSPACE, "c1", "41384596015")).toEqual({
            schemaVersion: 1,
            runId: "41384596015",
            commit: "c1",
            contexts: {
                [DEPLOYMENT]: { detected: 2, undetected: 2 },
                [BPMN]: { detected: 1, undetected: 0 },
                [DMN]: { detected: 0, undetected: 0 },
            },
        });
    });

    it("lists the undetected mutants of each context for the summary", () => {
        const tallies = contextTallies(
            strykerReport({ "src/kernel/domain/a.ts": ["Killed", "Survived", "NoCoverage"] }),
        );

        expect(tallies.get("kernel")?.survivors).toEqual([
            "src/kernel/domain/a.ts:2 ConditionalExpression",
            "src/kernel/domain/a.ts:3 ConditionalExpression",
        ]);
    });

    it.each([
        { case: "no object", report: null, problem: "the Stryker report has no files" },
        {
            case: "no files",
            report: { schemaVersion: "1.0" },
            problem: "the Stryker report has no files",
        },
        {
            case: "a file outside a domain folder",
            report: strykerReport({ "src/kernel/service/a.ts": ["Killed"] }),
            problem: "src/kernel/service/a.ts is not in a src/<context>/domain/ folder",
        },
        {
            case: "a file without mutants",
            report: { files: { "src/kernel/domain/a.ts": {} } },
            problem: "src/kernel/domain/a.ts has no mutants",
        },
        {
            case: "a mutant without status",
            report: { files: { "src/kernel/domain/a.ts": { mutants: [{}] } } },
            problem: "src/kernel/domain/a.ts has a mutant without status",
        },
    ])("is broken input with $case", ({ report, problem }) => {
        expect(() => mutationRunFromStrykerReport(report, WORKSPACE, "c1", "1")).toThrow(problem);
    });
});
