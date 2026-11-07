import { describe, expect, it } from "vitest";

import { fakeFitnessFunction, finding } from "../__fixtures__/inMemoryPorts";
import { changesReport } from "./changesReport";
import type { Finding } from "./finding";
import type { FitnessFunction } from "./fitnessFunction";
import { type FitnessReport, functionReport } from "./report";
import type { Measurement } from "./snapshot";

const HEAD = "1111111111112222";
const BASE = "3333333333334444";

const coupling = fakeFitnessFunction({});
const quiet = fakeFitnessFunction({}, { id: "quiet-one", measures: "quiet things" });
const mutation = fakeFitnessFunction({}, { id: "mutation-score", measures: "surviving mutants" });

interface Measured {
    readonly fitnessFunction: FitnessFunction;
    readonly head: Measurement;
    readonly base: Measurement;
}

function reportOf(measured: readonly Measured[], uncommittedChanges = false): FitnessReport {
    return {
        head: { commit: HEAD, uncommittedChanges },
        base: { commit: BASE, ref: "origin/main" },
        functions: measured.map(({ fitnessFunction, head, base }) =>
            functionReport(fitnessFunction, head, { source: "snapshot", measurement: base }),
        ),
    };
}

const changed: Measured = {
    fitnessFunction: coupling,
    head: { findings: [finding("A"), finding("B")] },
    base: { findings: [finding("A"), finding("C")] },
};
const unchanged: Measured = {
    fitnessFunction: quiet,
    head: { findings: [finding("Q")] },
    base: { findings: [finding("Q")] },
};
const unmeasurable: Measured = {
    fitnessFunction: mutation,
    head: { unmeasurable: "no mutation run" },
    base: { findings: [] },
};

function findings(prefix: string, count: number): Finding[] {
    return Array.from({ length: count }, (_, index) => ({
        ...finding(`${prefix}${String(index).padStart(3, "0")}`),
        message: `${prefix} row ${index} breaks a rule with a message long enough to weigh something`,
    }));
}

function shownRows(markdown: string, status: "new" | "resolved", prefix: string): number {
    return markdown.split("\n").filter((line) => line.startsWith(`| ${status} | \`src/${prefix}`))
        .length;
}

describe("the changes report", () => {
    it("says so on its first line and in its text when nothing changed", () => {
        const markdown = changesReport(reportOf([unchanged]));

        expect(markdown.split("\n")[0]).toBe("<!-- fitness-changes: none -->");
        expect(markdown).toContain("No fitness function has a new or resolved finding.");
        expect(markdown).toContain("- **No change:** `quiet-one`");
        expect(markdown).not.toContain("quiet things");
        expect(markdown).not.toContain("| existing |");
    });

    it("marks a report with a new or resolved row on its first line", () => {
        expect(changesReport(reportOf([changed, unchanged])).split("\n")[0]).toBe(
            "<!-- fitness-changes: some -->",
        );
    });

    it("prints a changed function's new and resolved rows, not its existing ones", () => {
        const markdown = changesReport(reportOf([changed]));

        expect(markdown).toContain(
            [
                "### `fake-coupling` version 2",
                "",
                "**1 new, 1 existing, 1 resolved**",
                "",
                "- **Base:** stored snapshot of the merge base",
            ].join("\n"),
        );
        expect(markdown).toContain(
            [
                "| Status | Location | Message |",
                "| --- | --- | --- |",
                "| new | `src/B.ts:1` | B breaks the rule |",
                "| resolved | `src/C.ts:1` | C breaks the rule |",
            ].join("\n"),
        );
        expect(markdown).not.toContain("src/A.ts");
    });

    it("folds a changed function's declarations into <details>", () => {
        expect(changesReport(reportOf([changed]))).toContain(
            [
                "<details>",
                "<summary>What it measures and its limits</summary>",
                "",
                "- **Measures:** files that change together",
                "- **Misses:**",
                "  - coupling through a shared file outside the feature",
                "- **Reports wrongly:**",
                "  - a rename as a new coupling",
                "- **Evidence:**",
                "  - Published: Tornhill, Your Code as a Crime Scene",
                "  - Trial at `773f8014`: 50 of 200 PRs",
                "",
                "</details>",
            ].join("\n"),
        );
    });

    it("names unchanged functions in one line and unmeasurable ones with their reasons", () => {
        const loud = fakeFitnessFunction({}, { id: "loud-one" });
        const markdown = changesReport(
            reportOf([
                unchanged,
                { ...unchanged, fitnessFunction: loud },
                unmeasurable,
                {
                    ...unmeasurable,
                    fitnessFunction: fakeFitnessFunction({}, { id: "other-gap" }),
                    head: { unmeasurable: "history too short" },
                },
            ]),
        );

        expect(markdown).toContain(
            [
                "- **No change:** `quiet-one`, `loud-one`",
                "- **Not measurable at HEAD:** `mutation-score` (no mutation run); `other-gap` (history too short)",
            ].join("\n"),
        );
        expect(markdown).not.toContain("surviving mutants");
        expect(markdown.split("\n")[0]).toBe("<!-- fitness-changes: none -->");
    });

    it("says that every row is new when the merge base was not measurable", () => {
        const markdown = changesReport(
            reportOf([{ ...changed, base: { unmeasurable: "history too short" } }]),
        );

        expect(markdown).toContain("**2 new, 0 existing, 0 resolved**");
        expect(markdown).toContain(
            "not measurable there (history too short); every finding counts as new",
        );
    });

    it("names HEAD with its label and the merge base", () => {
        expect(
            changesReport(reportOf([changed], true), { headLabel: "test merge of `abc`" }),
        ).toContain(
            [
                "## Fitness function changes",
                "",
                "HEAD `111111111111` (test merge of `abc`) with uncommitted changes against `333333333333`, its merge base with `origin/main`.",
            ].join("\n"),
        );
    });

    it("prints a report without fitness functions", () => {
        const markdown = changesReport(reportOf([]));

        expect(markdown).toContain("No fitness function is registered.");
        expect(markdown.split("\n")[0]).toBe("<!-- fitness-changes: none -->");
    });

    it("prints new and resolved rows in their groups, a collapsed group folded", () => {
        const grouped = fakeFitnessFunction(
            {},
            {
                groups: [
                    { id: "hidden", title: "Hidden" },
                    { id: "files", title: "Every measured file", collapsed: true },
                ],
            },
        );

        const markdown = changesReport(
            reportOf([
                {
                    fitnessFunction: grouped,
                    head: {
                        findings: [
                            { ...finding("A"), group: "files" },
                            { ...finding("B"), group: "hidden" },
                        ],
                    },
                    base: {
                        findings: [
                            { ...finding("C"), group: "files" },
                            { ...finding("D"), group: "retired" },
                        ],
                    },
                },
            ]),
        );

        expect(markdown).toContain(
            [
                "#### Hidden",
                "",
                "| Status | Location | Message |",
                "| --- | --- | --- |",
                "| new | `src/B.ts:1` | B breaks the rule |",
                "",
                "<details>",
                "<summary>Every measured file (2)</summary>",
                "",
                "| Status | Location | Message |",
                "| --- | --- | --- |",
                "| new | `src/A.ts:1` | A breaks the rule |",
                "| resolved | `src/C.ts:1` | C breaks the rule |",
                "",
                "</details>",
                "",
                "#### In no declared group",
                "",
                "| Status | Location | Message |",
                "| --- | --- | --- |",
                "| resolved | `src/D.ts:1` | D breaks the rule |",
            ].join("\n"),
        );
    });

    it("prints the new rows before the resolved ones, each in rank order", () => {
        const markdown = changesReport(
            reportOf([
                {
                    fitnessFunction: coupling,
                    head: {
                        findings: [
                            { ...finding("Z"), rank: 1 },
                            { ...finding("Y"), rank: 2 },
                        ],
                    },
                    base: {
                        findings: [
                            { ...finding("B"), rank: 2 },
                            { ...finding("A"), rank: 1 },
                        ],
                    },
                },
            ]),
        );

        expect(markdown).toContain(
            [
                "| new | `src/Z.ts:1` | Z breaks the rule |",
                "| new | `src/Y.ts:1` | Y breaks the rule |",
                "| resolved | `src/A.ts:1` | A breaks the rule |",
                "| resolved | `src/B.ts:1` | B breaks the rule |",
            ].join("\n"),
        );
    });

    it("prints a Trend column for a function that declares values", () => {
        const sized = fakeFitnessFunction({}, { values: [{ id: "lines", title: "code lines" }] });

        expect(
            changesReport(
                reportOf([{ fitnessFunction: sized, head: { findings: [] }, base: changed.base }]),
            ),
        ).toContain("| resolved | `src/C.ts:1` | C breaks the rule | no trend |");
    });
});

describe("the capped changes report", () => {
    const large: Measured = {
        fitnessFunction: coupling,
        head: { findings: findings("N", 30) },
        base: { findings: findings("R", 30) },
    };
    const small: Measured = {
        fitnessFunction: quiet,
        head: { findings: findings("S", 2) },
        base: { findings: [] },
    };
    const report = reportOf([large, small, unmeasurable]);
    const uncapped = changesReport(report);

    it("is the uncapped report when that fits", () => {
        expect(changesReport(report, { maxCharacters: uncapped.length })).toBe(uncapped);
    });

    it("keeps a small function's rows and caps the larger one with a pointer to the job summary", () => {
        const markdown = changesReport(report, { maxCharacters: uncapped.length - 2_000 });

        expect(markdown.length).toBeLessThanOrEqual(uncapped.length - 2_000);
        expect(shownRows(markdown, "new", "S")).toBe(2);
        const shown = shownRows(markdown, "new", "N") + shownRows(markdown, "resolved", "R");
        expect(shown).toBeLessThan(60);
        expect(markdown).toContain(
            `${60 - shown} more rows (${30 - shownRows(markdown, "new", "N")} new, ${30 - shownRows(markdown, "resolved", "R")} resolved) are left out to fit; the job summary lists every row.`,
        );
    });

    it("drops the declarations once no row is left, and says where they are", () => {
        const countsOnly = changesReport(report, { maxCharacters: 700 });

        expect(countsOnly.length).toBeLessThanOrEqual(700);
        expect(countsOnly).not.toContain("<details>");
        expect(countsOnly).toContain("**30 new, 0 existing, 30 resolved**");
        expect(countsOnly).toContain(
            "Each function's measures and limits are left out to fit; the job summary lists them.",
        );
        expect(countsOnly).toContain(
            "60 more rows (30 new, 30 resolved) are left out to fit; the job summary lists every row.",
        );
    });

    it("names a single left-out row as one", () => {
        const twoLongRows = reportOf([
            {
                ...small,
                head: {
                    findings: findings("S", 2).map((row) => ({
                        ...row,
                        message: row.message.repeat(4),
                    })),
                },
            },
        ]);
        const maxCharacters = changesReport(twoLongRows).length - 50;

        const markdown = changesReport(twoLongRows, { maxCharacters });

        expect(shownRows(markdown, "new", "S")).toBe(1);
        expect(markdown).toContain(
            "1 more row (1 new, 0 resolved) is left out to fit; the job summary lists every row.",
        );
    });

    it("says that the changes do not fit when not even the counts do", () => {
        expect(changesReport(report, { maxCharacters: 300 })).toBe(
            [
                "<!-- fitness-changes: some -->",
                "## Fitness function changes",
                "",
                "The changes do not fit in 300 characters; the job summary lists them.",
                "",
            ].join("\n"),
        );
    });

    const budgets = Array.from({ length: 40 }, (_, index) =>
        Math.round(300 + (index * (uncapped.length - 300)) / 39),
    );

    it.each(budgets)("stays within %i characters and valid Markdown", (maxCharacters) => {
        const markdown = changesReport(report, { maxCharacters });
        const lines = markdown.split("\n");

        expect(markdown.length).toBeLessThanOrEqual(maxCharacters);
        expect(lines[0]).toBe("<!-- fitness-changes: some -->");
        expect(markdown.match(/<details>/g)?.length).toBe(markdown.match(/<\/details>/g)?.length);
        lines.forEach((line, index) => {
            if (line.startsWith("| ") && !lines[index - 1].startsWith("|")) {
                expect(line).toBe("| Status | Location | Message |");
                expect(lines[index + 1]).toBe("| --- | --- | --- |");
            }
        });
        if (shownRows(markdown, "resolved", "R") > 0) {
            expect(shownRows(markdown, "new", "N")).toBe(30);
        }
    });
});
