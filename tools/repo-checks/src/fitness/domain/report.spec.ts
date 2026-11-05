import { describe, expect, it } from "vitest";

import { fakeFitnessFunction, finding } from "../__fixtures__/inMemoryPorts";
import type { Finding } from "./finding";
import { jsonReport } from "./jsonReport";
import { markdownReport } from "./markdownReport";
import { type FitnessReport, functionReport } from "./report";
import { emptySnapshot, type Measurement, withEntry } from "./snapshot";

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

describe("a report of a function that declares values", () => {
    const sized = fakeFitnessFunction(
        {},
        {
            id: "size",
            values: [
                { id: "codeLines", title: "code lines" },
                { id: "complexity", title: "complexity" },
            ],
        },
    );
    const measured = (codeLines: number, complexity = 4) => ({
        ...finding("A"),
        values: { codeLines, complexity },
    });
    const history = {
        headCommit: HEAD,
        commitsNewestFirst: [BASE, "c1"],
        snapshots: new Map([
            [
                BASE,
                withEntry(emptySnapshot(BASE), "size", { version: 2, findings: [measured(330)] }),
            ],
            [
                "c1",
                withEntry(emptySnapshot("c1"), "size", { version: 2, findings: [measured(300)] }),
            ],
        ]),
    };

    function sizedReport(head: readonly Finding[]): FitnessReport {
        return {
            head: { commit: HEAD, uncommittedChanges: false },
            base: { commit: BASE, ref: "origin/main" },
            functions: [
                functionReport(
                    sized,
                    { findings: head },
                    { source: "snapshot", measurement: { findings: [measured(330)] } },
                    history,
                ),
            ],
        };
    }

    it("attaches each finding's trend over the stored snapshots", () => {
        const [reported] = sizedReport([measured(348)]).functions;

        expect(reported.outcome).toMatchObject({
            findings: [
                {
                    key: "A",
                    status: "existing",
                    trend: [
                        { commit: "c1", values: { codeLines: 300, complexity: 4 } },
                        { commit: BASE, values: { codeLines: 330, complexity: 4 } },
                        { commit: HEAD, values: { codeLines: 348, complexity: 4 } },
                    ],
                },
            ],
        });
    });

    it("prints only the values that changed in a Trend column", () => {
        expect(markdownReport(sizedReport([measured(348)]))).toContain(
            [
                "| Status | Location | Message | Trend |",
                "| --- | --- | --- | --- |",
                "| existing | `src/A.ts:1` | A breaks the rule | code lines 300 → 330 → 348 |",
            ].join("\n"),
        );
    });

    it("prints a value that is missing at a point as none", () => {
        const [reported] = sizedReport([{ ...finding("A"), values: { codeLines: 330 } }]).functions;

        expect(markdownReport({ ...sizedReport([]), functions: [reported] })).toContain(
            "| code lines 300 → 330; complexity 4 → none |",
        );
    });

    it("prints a finding whose values never changed as unchanged", () => {
        const unchanged = {
            ...history,
            snapshots: new Map([
                [
                    BASE,
                    withEntry(emptySnapshot(BASE), "size", {
                        version: 2,
                        findings: [measured(330)],
                    }),
                ],
            ]),
        };
        const report: FitnessReport = {
            ...sizedReport([]),
            functions: [
                functionReport(
                    sized,
                    { findings: [measured(330)] },
                    { source: "snapshot", measurement: { findings: [] } },
                    unchanged,
                ),
            ],
        };

        expect(markdownReport(report)).toContain("| A breaks the rule | unchanged |");
    });

    it("prints a finding that no stored snapshot holds as no trend, not as unchanged", () => {
        const added = { ...finding("B"), values: { codeLines: 5 } };

        expect(markdownReport(sizedReport([measured(348), added]))).toContain(
            "| new | `src/B.ts:1` | B breaks the rule | no trend |",
        );
    });

    it("attaches no trend for a function that declares no values", () => {
        const reported = functionReport(
            fake,
            { findings: [finding("A")] },
            { source: "snapshot", measurement: { findings: [] } },
            history,
        );

        expect(reported.outcome).toEqual({
            kind: "measured",
            findings: [{ ...finding("A"), status: "new" }],
            resolved: [],
        });
        expect(markdownReport({ ...sizedReport([]), functions: [reported] })).not.toContain(
            "Trend",
        );
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

    it("prints one table per group in declared order, a collapsed one folded, an empty one not at all", () => {
        const grouped = fakeFitnessFunction(
            {},
            {
                groups: [
                    { id: "hidden", title: "Hidden" },
                    { id: "empty", title: "Empty" },
                    { id: "explained", title: "Explained", collapsed: true },
                ],
            },
        );
        const report: FitnessReport = {
            head: { commit: HEAD, uncommittedChanges: false },
            base: { commit: BASE, ref: "origin/main" },
            functions: [
                functionReport(
                    grouped,
                    {
                        findings: [
                            { ...finding("A"), group: "explained" },
                            { ...finding("B"), group: "hidden" },
                            { ...finding("C"), group: "explained" },
                        ],
                    },
                    { source: "snapshot", measurement: { findings: [] } },
                ),
            ],
        };

        const markdown = markdownReport(report);

        expect(markdown).toContain(
            [
                "**3 new, 0 existing, 0 resolved**",
                "",
                "### Hidden",
                "",
                "| Status | Location | Message |",
                "| --- | --- | --- |",
                "| new | `src/B.ts:1` | B breaks the rule |",
                "",
                "<details>",
                "<summary>Explained (2)</summary>",
                "",
                "| Status | Location | Message |",
                "| --- | --- | --- |",
                "| new | `src/A.ts:1` | A breaks the rule |",
                "| new | `src/C.ts:1` | C breaks the rule |",
                "",
                "</details>",
            ].join("\n"),
        );
        expect(markdown).not.toContain("Empty");
        expect(JSON.parse(jsonReport(report)).functions[0].outcome.findings).toEqual([
            { ...finding("A"), group: "explained", status: "new" },
            { ...finding("B"), group: "hidden", status: "new" },
            { ...finding("C"), group: "explained", status: "new" },
        ]);
    });

    it("prints ranked findings in rank order, then by path", () => {
        const ranked = [
            { ...finding("A"), rank: 2 },
            { ...finding("B"), rank: 1 },
            { ...finding("C"), rank: 2 },
        ];

        const markdown = markdownReport(reportOf({ findings: ranked }, { findings: [] }));

        expect(markdown).toContain(
            [
                "| new | `src/B.ts:1` | B breaks the rule |",
                "| new | `src/A.ts:1` | A breaks the rule |",
                "| new | `src/C.ts:1` | C breaks the rule |",
            ].join("\n"),
        );
    });

    it("prints no table without findings", () => {
        expect(markdownReport(reportOf({ findings: [] }, { findings: [] }))).not.toContain(
            "| Status |",
        );
    });
});
