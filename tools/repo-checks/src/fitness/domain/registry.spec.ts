import { describe, expect, it } from "vitest";

import { fakeFitnessFunction } from "../__fixtures__/inMemoryPorts";
import { registryProblems } from "./registry";

const coupling = fakeFitnessFunction({}, { id: "coupling" });

describe("the registry of fitness functions", () => {
    it.each([
        { case: "names the function", skill: "Measured by `coupling`.", problems: [] },
        {
            case: "names only a longer id",
            skill: "Measured by change-coupling-v2.",
            problems: ["the skill architecture does not name coupling"],
        },
        {
            case: "names nothing",
            skill: "Keep features in one folder.",
            problems: ["the skill architecture does not name coupling"],
        },
    ])("accepts a skill only if it $case", ({ skill, problems }) => {
        expect(registryProblems([coupling], new Map([["architecture", skill]]))).toEqual(problems);
    });

    it("rejects a skill that does not exist", () => {
        expect(registryProblems([coupling], new Map())).toEqual([
            "coupling relies on the skill architecture, which does not exist",
        ]);
    });

    it("rejects an id registered twice", () => {
        expect(
            registryProblems([coupling, coupling], new Map([["architecture", "coupling"]])),
        ).toEqual(["coupling is registered twice"]);
    });
});
