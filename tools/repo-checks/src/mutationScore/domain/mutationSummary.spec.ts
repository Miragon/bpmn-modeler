import { describe, expect, it } from "vitest";

import { strykerReport } from "../__fixtures__/strykerReports";
import { mutationSummaryMarkdown } from "./mutationSummary";
import { contextTallies } from "./strykerReport";

const WORKSPACE = "libs/modeler-core";

describe("the mutation summary", () => {
    it("tables the score per context and folds the undetected mutants", () => {
        const tallies = contextTallies(
            strykerReport({
                "src/kernel/domain/a.ts": ["Killed", "Killed", "Survived"],
                "src/modeler/dmn/domain/b.ts": ["Ignored"],
            }),
        );

        expect(mutationSummaryMarkdown(WORKSPACE, tallies)).toBe(
            [
                "## Mutation score of `libs/modeler-core` domain rules",
                "",
                "| Context | Score | Killed | Survived or uncovered |",
                "|---|---:|---:|---:|",
                "| kernel | 66.7% | 2 | 1 |",
                "| modeler/dmn | n/a | 0 | 0 |",
                "| **Total** | **66.7%** | 2 | 1 |",
                "",
                "<details><summary>1 surviving mutants</summary>",
                "",
                "- `src/kernel/domain/a.ts:3 ConditionalExpression`",
                "",
                "</details>",
                "",
            ].join("\n"),
        );
    });

    it("lists no survivors when every mutant was detected", () => {
        expect(
            mutationSummaryMarkdown(
                WORKSPACE,
                contextTallies(strykerReport({ "src/kernel/domain/a.ts": ["Killed"] })),
            ),
        ).not.toContain("<details>");
    });
});
