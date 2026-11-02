import { describe, expect, it } from "vitest";

import { fakeFitnessFunction, finding } from "../__fixtures__/inMemoryPorts";
import { markdownReport } from "./markdownReport";
import { type FitnessReport, functionReport } from "./report";
import type { Measurement } from "./snapshot";

const fake = fakeFitnessFunction({});
const HEAD = "1111111111112222";
const BASE = "3333333333334444";

function reportOf(head: Measurement, base: Measurement, uncommittedChanges = false): FitnessReport {
    return {
        head: { commit: HEAD, uncommittedChanges },
        base: { commit: BASE, ref: "origin/main" },
        functions: [functionReport(fake, head, { source: "snapshot", measurement: base })],
    };
}

describe("a function's report", () => {
    it("counts every finding as new when the merge base was not measurable", () => {
        expect(
            functionReport(
                fake,
                { findings: [finding("A")] },
                { source: "checkout", measurement: { unmeasurable: "history too short" } },
            ),
        ).toMatchObject({
            base: { source: "checkout", unmeasurable: "history too short" },
            outcome: { kind: "measured", findings: [{ key: "A", status: "new" }], resolved: [] },
        });
    });

    it("carries the reason when HEAD is not measurable", () => {
        expect(
            functionReport(
                fake,
                { unmeasurable: "no mutation run" },
                {
                    source: "snapshot",
                    measurement: { findings: [finding("A")] },
                },
            ).outcome,
        ).toEqual({ kind: "unmeasurable", reason: "no mutation run" });
    });
});

describe("the Markdown report", () => {
    it.each([
        {
            case: "names HEAD and the merge base by their short commits",
            report: reportOf({ findings: [] }, { findings: [] }),
            text: "HEAD `111111111111` against `333333333333`, its merge base with `origin/main`.",
        },
        {
            case: "says when the working tree has uncommitted changes",
            report: reportOf({ findings: [] }, { findings: [] }, true),
            text: "HEAD `111111111111` with uncommitted changes against",
        },
        {
            case: "counts new, existing and resolved findings",
            report: reportOf(
                { findings: [finding("A"), finding("B")] },
                { findings: [finding("A"), finding("C")] },
            ),
            text: "**1 new, 1 existing, 1 resolved**",
        },
        {
            case: "lists resolved findings by location",
            report: reportOf({ findings: [] }, { findings: [finding("C", 4)] }),
            text: "Resolved since the merge base:\n\n- `src/C.ts:4` C breaks the rule",
        },
        {
            case: "keeps a message with a pipe and a line break in its table cell",
            report: reportOf(
                { findings: [{ ...finding("A"), message: "a | b\nc" }] },
                { findings: [] },
            ),
            text: "| new | `src/A.ts:1` | a \\| b c |",
        },
        {
            case: "keeps a backslash before a pipe from closing the table cell",
            report: reportOf(
                { findings: [{ ...finding("A"), message: "a\\|b" }] },
                { findings: [] },
            ),
            text: "| new | `src/A.ts:1` | a\\\\\\|b |",
        },
        {
            case: "gives the reason HEAD was not measurable",
            report: reportOf({ unmeasurable: "no mutation run" }, { findings: [] }),
            text: "Not measurable at HEAD: no mutation run",
        },
        {
            case: "says why the base was not measurable",
            report: reportOf({ findings: [] }, { unmeasurable: "history too short" }),
            text: "not measurable there (history too short); every finding counts as new",
        },
        {
            case: "names a trial by its short commit",
            report: reportOf({ findings: [] }, { findings: [] }),
            text: "  - Trial at `773f8014`: 50 of 200 PRs",
        },
    ])("$case", ({ report, text }) => {
        expect(markdownReport(report)).toContain(text);
    });

    it("prints no table without findings", () => {
        expect(markdownReport(reportOf({ findings: [] }, { findings: [] }))).not.toContain(
            "| Status |",
        );
    });
});
