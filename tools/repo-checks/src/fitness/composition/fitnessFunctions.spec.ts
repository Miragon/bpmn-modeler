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
});
