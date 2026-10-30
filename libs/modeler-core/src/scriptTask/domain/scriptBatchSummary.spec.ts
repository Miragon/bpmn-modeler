import { describe, expect, it } from "vitest";

import {
    type ScriptBatchOutcome,
    scriptBatchOutcome,
    type ScriptBatchResult,
    scriptBatchSummary,
} from "./scriptBatchSummary";

const written: ScriptBatchResult = { kind: "written" };
const alreadyOpen: ScriptBatchResult = { kind: "alreadyOpen" };
const cancelled: ScriptBatchResult = { kind: "cancelled" };
const failed: ScriptBatchResult = { kind: "failed" };

describe("scriptBatchOutcome", () => {
    it.each([
        { run: "no script", results: [], expected: { generated: 0, alreadyOpen: 0, failed: 0 } },
        {
            run: "written scripts",
            results: [written, written],
            expected: { generated: 2, alreadyOpen: 0, failed: 0 },
        },
        {
            run: "scripts already open",
            results: [alreadyOpen, written, alreadyOpen],
            expected: { generated: 1, alreadyOpen: 2, failed: 0 },
        },
        {
            run: "failed scripts",
            results: [failed, written, failed, failed],
            expected: { generated: 1, alreadyOpen: 0, failed: 3 },
        },
        {
            run: "cancelled scripts in no count",
            results: [cancelled, written, cancelled, alreadyOpen, failed],
            expected: { generated: 1, alreadyOpen: 1, failed: 1 },
        },
    ] satisfies { run: string; results: ScriptBatchResult[]; expected: ScriptBatchOutcome }[])(
        "counts $run",
        ({ results, expected }) => {
            expect(scriptBatchOutcome(results)).toEqual(expected);
        },
    );
});

describe("scriptBatchSummary", () => {
    it.each([
        {
            run: "names the output folder",
            outcome: { generated: 2, alreadyOpen: 0, failed: 0 },
            expected:
                "Generated 2 script file(s) in scripts — open a file to edit it with live sync into the diagram.",
        },
        {
            run: "mentions scripts left untouched because they were already open",
            outcome: { generated: 1, alreadyOpen: 3, failed: 0 },
            expected:
                "Generated 1 script file(s) in scripts (3 already open, left untouched) — open a file to edit it with live sync into the diagram.",
        },
        {
            run: "counts the scripts that could not be written",
            outcome: { generated: 1, alreadyOpen: 0, failed: 2 },
            expected:
                "Generated 1 script file(s) in scripts — open a file to edit it with live sync into the diagram. Could not write 2 script file(s); see the log for details.",
        },
        {
            run: "mentions already-open and unwritten scripts together",
            outcome: { generated: 1, alreadyOpen: 1, failed: 1 },
            expected:
                "Generated 1 script file(s) in scripts (1 already open, left untouched) — open a file to edit it with live sync into the diagram. Could not write 1 script file(s); see the log for details.",
        },
        {
            run: "asks to open no file when nothing was generated",
            outcome: { generated: 0, alreadyOpen: 0, failed: 0 },
            expected: "No script files generated in scripts.",
        },
        {
            run: "asks to open no file when every script was already open",
            outcome: { generated: 0, alreadyOpen: 2, failed: 0 },
            expected: "No script files generated in scripts (2 already open, left untouched).",
        },
        {
            run: "asks to open no file when every script failed",
            outcome: { generated: 0, alreadyOpen: 0, failed: 1 },
            expected:
                "No script files generated in scripts. Could not write 1 script file(s); see the log for details.",
        },
    ] satisfies { run: string; outcome: ScriptBatchOutcome; expected: string }[])(
        "$run",
        ({ outcome, expected }) => {
            expect(scriptBatchSummary(outcome, "scripts")).toBe(expected);
        },
    );

    it.each([
        {
            run: "names no folder when every script failed before one was resolved",
            outcome: { generated: 0, alreadyOpen: 0, failed: 2 },
            expected:
                "No script files generated. Could not write 2 script file(s); see the log for details.",
        },
        {
            run: "names no folder when every language pick was cancelled",
            outcome: { generated: 0, alreadyOpen: 0, failed: 0 },
            expected: "No script files generated.",
        },
        {
            run: "still counts the generated scripts without a folder",
            outcome: { generated: 1, alreadyOpen: 1, failed: 0 },
            expected:
                "Generated 1 script file(s) (1 already open, left untouched) — open a file to edit it with live sync into the diagram.",
        },
    ] satisfies { run: string; outcome: ScriptBatchOutcome; expected: string }[])(
        "$run",
        ({ outcome, expected }) => {
            expect(scriptBatchSummary(outcome, undefined)).toBe(expected);
        },
    );
});
