import { describe, expect, it } from "vitest";

import { workspacesBuiltBy } from "./rootScripts";

const scripts: Record<string, string> = {
    "build": "npm-run-all -s build:libs -p build:one build:two -s build:plugin",
    "build:libs": "npm-run-all build:lib:a",
    "build:lib:a": "corepack yarn workspace @scope/lib-a build",
    "build:one": "corepack yarn workspace @scope/one build",
    "build:two": "yarn workspace @scope/two build",
    "build:plugin": "corepack yarn workspace @scope/plugin build",
    "compile:bridge": "corepack yarn workspace @scope/bridge compile",
    "run:ide": "cd apps/ide && ./gradlew runIde",
    "loop": "npm-run-all loop build:one",
    "broken": "npm-run-all -p build:one build:missing",
    "globbed": "npm-run-all build:*",
};

describe("the workspaces a yarn command builds", () => {
    it.each([
        ["build", ["@scope/lib-a", "@scope/one", "@scope/two", "@scope/plugin"]],
        ["build:two", ["@scope/two"]],
        ["workspace @scope/one build", ["@scope/one"]],
        ["workspace @scope/one dev", []],
        ["compile:bridge", []],
        ["run:ide", []],
        ["install", []],
        ["loop", ["@scope/one"]],
    ])("follows `yarn %s` through the root scripts", (command, built) => {
        expect(workspacesBuiltBy(scripts, command)).toEqual(built);
    });

    it("fails on an npm-run-all token that names no script, as npm-run-all does", () => {
        expect(() => workspacesBuiltBy(scripts, "broken")).toThrow(
            "npm-run-all in the root script broken runs build:missing, which is no root script",
        );
    });

    it("fails on an npm-run-all glob instead of guessing what it matches", () => {
        expect(() => workspacesBuiltBy(scripts, "globbed")).toThrow("build:*");
    });
});
