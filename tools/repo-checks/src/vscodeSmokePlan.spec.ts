import type { SourceFile } from "@miragon/architecture-testing";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
    LISTED_FILES_LIMIT,
    planJobs,
    selectSuites,
    suiteFile,
    type SmokeSuiteRegistry,
} from "../../../.github/scripts/vscode-smoke-plan.mjs";
import { globToRegExp } from "../../../.github/scripts/glob.mjs";
import { triggerPaths } from "./testing/workflowText";

const repoRoot = join(__dirname, "../../..");
const REGISTRY_PATH = ".github/vscode-smoke-suites.json";
const WORKFLOW_PATH = ".github/workflows/vscode-smoke.yml";
const SMOKE_FOLDER = "apps/vscode-plugin/test/smoke";

function readRepoFile(path: string): SourceFile {
    return { path, text: readFileSync(join(repoRoot, path), "utf8") };
}

const registry = JSON.parse(readRepoFile(REGISTRY_PATH).text) as SmokeSuiteRegistry;
const allSuites = Object.keys(registry.suites);

/** A registry of three suites, so a case states its own rules. */
const sample: SmokeSuiteRegistry = {
    maxJobs: 2,
    jobSeconds: 100,
    suites: { editor: { seconds: 20 }, diff: { seconds: 30 }, allowance: { seconds: 200 } },
    baseline: ["editor"],
    ignore: ["**/*.md", "**/*.spec.ts"],
    rules: [
        { paths: ["libs/diff/**", "apps/webview/src/diff*"], suites: ["diff"] },
        { paths: ["apps/deployment/**"], suites: [] },
    ],
};

describe("the suites a change selects", () => {
    it("runs the suites of the first rule a file matches, with the baseline", () => {
        expect(selectSuites(sample, ["libs/diff/src/diff.ts"])).toEqual(["editor", "diff"]);
    });

    it("runs only the baseline for a file whose rule names no suite", () => {
        expect(selectSuites(sample, ["apps/deployment/src/view.ts"])).toEqual(["editor"]);
    });

    it("runs every suite for a file no rule knows", () => {
        expect(selectSuites(sample, ["libs/shared/src/protocol.ts"])).toEqual([
            "editor",
            "diff",
            "allowance",
        ]);
    });

    it("runs nothing for ignored files, also below a rule's folder", () => {
        expect(selectSuites(sample, ["libs/diff/README.md", "libs/shared/src/a.spec.ts"])).toEqual(
            [],
        );
    });

    it("runs a changed suite file alone, without the baseline", () => {
        expect(selectSuites(sample, [suiteFile("diff")])).toEqual(["diff"]);
    });

    it("runs every suite for another file of the smoke folder", () => {
        expect(selectSuites(sample, [`${SMOKE_FOLDER}/support/sharedHelper.ts`])).toEqual([
            "editor",
            "diff",
            "allowance",
        ]);
    });

    it("unites the suites of all changed files in the registry's order", () => {
        expect(
            selectSuites(sample, ["libs/diff/src/diff.ts", "apps/deployment/src/view.ts"]),
        ).toEqual(["editor", "diff"]);
    });

    it("runs every suite once the files API listed as many files as it can", () => {
        const ignoredOnly = Array.from({ length: LISTED_FILES_LIMIT }, () => "docs/a.md");
        expect(selectSuites(sample, ignoredOnly)).toEqual(["editor", "diff", "allowance"]);
    });
});

describe("the jobs a selection is spread over", () => {
    it("plans no job for no suite", () => {
        expect(planJobs(sample, [])).toEqual([]);
    });

    it("keeps short suites in one job, which pays one install and build", () => {
        expect(planJobs(sample, ["editor", "diff"])).toEqual([
            {
                id: "1",
                name: "diff, editor",
                files: "test/smoke/diff.smoke.test.ts test/smoke/editor.smoke.test.ts",
            },
        ]);
    });

    it("gives the longest suite a job of its own and never plans more than maxJobs", () => {
        const jobs = planJobs(sample, ["editor", "diff", "allowance"]);

        expect(jobs.map(({ name }) => name)).toEqual(["allowance", "diff, editor"]);
    });
});

describe("the VS Code smoke suite registry", () => {
    const suiteFiles = readdirSync(join(repoRoot, SMOKE_FOLDER))
        .filter((file) => file.endsWith(".smoke.test.ts"))
        .map((file) => file.replace(/\.smoke\.test\.ts$/, ""));

    it("lists every suite file, so none drops out of CI", () => {
        expect([...allSuites].sort()).toEqual([...suiteFiles].sort());
    });

    it.each(allSuites)("has the file of %s", (suite) => {
        expect(existsSync(join(repoRoot, suiteFile(suite)))).toBe(true);
    });

    it("names only suites it lists in its rules and its baseline", () => {
        const named = [...registry.baseline, ...registry.rules.flatMap(({ suites }) => suites)];

        expect(named.filter((suite) => !allSuites.includes(suite))).toEqual([]);
    });

    it("plans every suite exactly once when all run", () => {
        const planned = planJobs(registry, allSuites).flatMap(({ name }) => name.split(", "));

        expect(planned.sort()).toEqual([...allSuites].sort());
    });

    it("runs on main for the same paths as on a pull request", () => {
        const workflow = readRepoFile(WORKFLOW_PATH);

        expect(triggerPaths(workflow, "push")).toEqual(triggerPaths(workflow, "pull_request"));
    });

    it("is triggered by every path one of its rules names", () => {
        const triggers = triggerPaths(readRepoFile(WORKFLOW_PATH), "pull_request")
            .filter((path) => !path.startsWith("!"))
            .map(globToRegExp);
        const isTriggered = (path: string) =>
            triggers.some((trigger) => trigger.test(path.replace(/\*+$/, "file")));
        const rulePaths = registry.rules.flatMap(({ paths }) => paths);

        expect(rulePaths.filter((path) => !isTriggered(path))).toEqual([]);
    });
});
