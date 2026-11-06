import { describe, expect, it } from "vitest";

import { measure } from "../../fitness/service/measurement";
import { InMemoryMutationRuns } from "../__fixtures__/inMemoryMutationPorts";
import type { MutationRun } from "../domain/mutationRun";
import { createMutationScoreFitnessFunction } from "./mutationScoreFitnessFunction";

const KERNEL = "libs/modeler-core/src/kernel/domain";

function run(runId: string, commit: string, detected: number): MutationRun {
    return { schemaVersion: 1, runId, commit, contexts: { [KERNEL]: { detected, undetected: 1 } } };
}

const RUNS = new InMemoryMutationRuns(
    [run("2", "c2", 3), run("1", "c1", 1)],
    ["c3", "c2", "c1", "c0"],
);

describe("the mutation score fitness function", () => {
    it("reports the runs on the measured commit's chain", () => {
        const fitnessFunction = createMutationScoreFitnessFunction({ runs: RUNS });

        expect(
            measure(fitnessFunction, { repoRoot: "/repo", commit: "c3", changeBase: "c3" }),
        ).toMatchObject({
            findings: [
                {
                    key: "libs/modeler-core",
                    message:
                        "total 75.0 % (3 detected, 1 undetected); runs: 50.0 % (c1) → 75.0 % (c2)",
                },
                { key: KERNEL },
            ],
        });
    });

    it("is not measurable before the first stored run", () => {
        const fitnessFunction = createMutationScoreFitnessFunction({ runs: RUNS });

        expect(
            measure(fitnessFunction, { repoRoot: "/repo", commit: "c0", changeBase: "c0" }),
        ).toEqual({
            unmeasurable:
                "none of the 2 stored mutation runs measured a commit on this first-parent chain",
        });
    });
});
