import { describe, expect, it } from "vitest";

import type { MutationRun } from "./mutationRun";
import { mutationScoreFindings, mutationScoreOnChain, mutationScoreSeries } from "./mutationScore";

const WORKSPACE = "libs/modeler-core";
const DEPLOYMENT = "libs/modeler-core/src/deployment/domain";
const BPMN = "libs/modeler-core/src/modeler/bpmn/domain";
const DMN = "libs/modeler-core/src/modeler/dmn/domain";

function run(runId: string, commit: string, contexts: MutationRun["contexts"]): MutationRun {
    return { schemaVersion: 1, runId, commit, contexts };
}

describe("the mutation score series", () => {
    it("holds the runs on the first-parent chain, oldest commit first, then by run id", () => {
        const runs = [
            run("10", "c3", {}),
            run("9", "c3", {}),
            run("8", "c1", {}),
            run("7", "side", {}),
        ];

        expect(mutationScoreSeries(["c3", "c2", "c1"], runs).map(({ runId }) => runId)).toEqual([
            "8",
            "9",
            "10",
        ]);
    });
});

describe("the mutation score findings", () => {
    it("give each context and the total its latest score, tallies and earlier runs", () => {
        const series = [
            run("1", "e2fb0e52aaaa", {
                [DEPLOYMENT]: { detected: 887, undetected: 113 },
                [BPMN]: { detected: 9, undetected: 1 },
            }),
            run("2", "89250994bbbb", {
                [DEPLOYMENT]: { detected: 901, undetected: 99 },
                [BPMN]: { detected: 10, undetected: 0 },
            }),
        ];

        expect(mutationScoreFindings(series)).toEqual([
            {
                key: WORKSPACE,
                path: WORKSPACE,
                line: 1,
                message:
                    "total 90.2 % (911 detected, 99 undetected); runs: 88.7 % (e2fb0e52) → 90.2 % (89250994)",
            },
            {
                key: DEPLOYMENT,
                path: DEPLOYMENT,
                line: 1,
                message:
                    "deployment 90.1 % (901 detected, 99 undetected); runs: 88.7 % (e2fb0e52) → 90.1 % (89250994)",
            },
            {
                key: BPMN,
                path: BPMN,
                line: 1,
                message:
                    "modeler/bpmn 100.0 % (10 detected, 0 undetected); runs: 90.0 % (e2fb0e52) → 100.0 % (89250994)",
            },
        ]);
    });

    it("give a context with no mutants no score", () => {
        const [, dmn] = mutationScoreFindings([
            run("1", "c1", { [DMN]: { detected: 0, undetected: 0 } }),
        ]);

        expect(dmn.message).toBe("modeler/dmn: no mutants, no score; runs: no score (c1)");
    });

    it("list the last 8 runs and a run that lacks the context as without score", () => {
        const series = Array.from({ length: 9 }, (_, index) =>
            run(
                String(index),
                `c${index}`,
                index === 3 ? {} : { [BPMN]: { detected: index, undetected: 1 } },
            ),
        );

        const [, bpmn] = mutationScoreFindings(series);

        expect(bpmn.message).toBe(
            "modeler/bpmn 88.9 % (8 detected, 1 undetected); runs: 50.0 % (c1) → 66.7 % (c2) → no score (c3) → 80.0 % (c4) → 83.3 % (c5) → 85.7 % (c6) → 87.5 % (c7) → 88.9 % (c8)",
        );
    });
});

describe("the mutation score on a chain", () => {
    it("ends the series where no stored run measured a commit on the chain", () => {
        expect(mutationScoreOnChain(["c2", "c1"], [run("1", "c3", {})])).toEqual({
            kind: "noRun",
            reason: "none of the 1 stored mutation runs measured a commit on this first-parent chain",
        });
    });

    it("measures with the runs on the chain", () => {
        expect(
            mutationScoreOnChain(
                ["c1"],
                [run("1", "c1", { [BPMN]: { detected: 1, undetected: 0 } })],
            ),
        ).toMatchObject({ kind: "measured", findings: [{ key: WORKSPACE }, { key: BPMN }] });
    });
});
