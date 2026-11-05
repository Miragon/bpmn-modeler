import { describe, expect, it } from "vitest";

import {
    type MutationRun,
    mutationRunPath,
    parseMutationRun,
    serializeMutationRun,
} from "./mutationRun";

const DEPLOYMENT = "libs/modeler-core/src/deployment/domain";

describe("a stored mutation run", () => {
    const run: MutationRun = {
        schemaVersion: 1,
        runId: "7",
        commit: "c1",
        contexts: { [DEPLOYMENT]: { detected: 3, undetected: 1 } },
    };

    it("is stored by its run id", () => {
        expect(mutationRunPath("7")).toBe("mutation/7.json");
    });

    it("parses what it serializes", () => {
        expect(parseMutationRun("7", serializeMutationRun(run))).toEqual(run);
    });

    it.each([
        { case: "no JSON", text: "{", problem: "mutation run 7 is no JSON" },
        {
            case: "another schema version",
            text: JSON.stringify({ ...run, schemaVersion: 2 }),
            problem: "mutation run 7 has schema version 2, expected 1",
        },
        {
            case: "another run id",
            text: JSON.stringify({ ...run, runId: "8" }),
            problem: "mutation run 7 names run 8",
        },
        {
            case: "no commit",
            text: JSON.stringify({ ...run, commit: "" }),
            problem: "mutation run 7 names no commit",
        },
        {
            case: "a tally that is no count",
            text: JSON.stringify({
                ...run,
                contexts: { [DEPLOYMENT]: { detected: -1, undetected: 0 } },
            }),
            problem: `mutation run 7 has no counts for ${DEPLOYMENT}`,
        },
        {
            case: "no contexts",
            text: JSON.stringify({ ...run, contexts: [] }),
            problem: "mutation run 7 has no contexts",
        },
    ])("is broken input with $case", ({ text, problem }) => {
        expect(() => parseMutationRun("7", text)).toThrow(problem);
    });
});
