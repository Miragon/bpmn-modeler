import { describe, expect, it } from "vitest";

import { missedPartnerReplayTable } from "./missedPartnerReplayTable";

describe("the missed partner replay table", () => {
    it("prints one row per candidate and marks the chosen one", () => {
        const table = missedPartnerReplayTable({
            head: "abc",
            replayedCommits: 199,
            lookAhead: 10,
            outcomes: [
                {
                    candidate: { minConfidencePercent: 30, minLift: 4 },
                    chosen: true,
                    warnings: 8,
                    hits: 3,
                    precision: 0.375,
                    chanceRate: 0.25,
                    margin: 0.125,
                },
                {
                    candidate: { minConfidencePercent: 60, minLift: 8 },
                    chosen: false,
                    warnings: 0,
                    hits: 0,
                    precision: undefined,
                    chanceRate: undefined,
                    margin: undefined,
                },
            ],
        });

        expect(table).toBe(
            [
                "## missed-partner replay",
                "",
                "HEAD `abc`, 199 replayed commits, a hit within the next 10 commits.",
                "",
                "| Confidence | Lift | Warnings | Hits | Precision | Chance | Margin (points) | |",
                "| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
                "| 30 % | 4 | 8 | 3 | 37.5 % | 25.0 % | 12.5 | chosen |",
                "| 60 % | 8 | 0 | 0 | – | – | – |  |",
                "",
            ].join("\n"),
        );
    });
});
