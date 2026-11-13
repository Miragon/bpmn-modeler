import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { registryProblems } from "../domain/registry";
import { FITNESS_FUNCTIONS } from "./fitnessFunctions";

const SKILLS_DIR = join(__dirname, "../../../../../.agents/skills");

function readSkillTexts(): Map<string, string> {
    return new Map(
        readdirSync(SKILLS_DIR)
            .filter((skill) => existsSync(join(SKILLS_DIR, skill, "SKILL.md")))
            .map((skill) => [skill, readFileSync(join(SKILLS_DIR, skill, "SKILL.md"), "utf8")]),
    );
}

describe("the registered fitness functions", () => {
    it("reads the skills", () => {
        expect(readSkillTexts().get("architecture")).toContain("architecture");
    });

    it("each rely on a skill that names them", () => {
        expect(registryProblems(FITNESS_FUNCTIONS, readSkillTexts())).toEqual([]);
    });

    it("show grown files in a pull request's changes and keep two functions to the full report", () => {
        const viewed = FITNESS_FUNCTIONS.flatMap(({ id, changesView }) =>
            changesView === undefined ? [] : [[id, changesView]],
        );

        expect(Object.fromEntries(viewed)).toEqual({
            "missed-partner": "full-report-only",
            "size-and-complexity": "grown-values",
            "mutation-score": "full-report-only",
        });
    });
});
