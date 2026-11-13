import { describe, expect, it } from "vitest";

import {
    focusedWorkspaces,
    jobConditionTargets,
    triggerPaths,
    workflowAssignment,
    workflowPattern,
    yarnRunSteps,
} from "./workflowText";

const workflow = {
    path: ".github/workflows/example.yml",
    text: `on:
  push:
    branches: [main]
    paths:
      - 'apps/one/**'
      - '!apps/one/MARKER'
  pull_request:
    paths:
      - 'apps/two/**'

jobs:
  publish:
    steps:
      - name: Install dependencies (focused)
        run: yarn workspaces focus root @scope/one @scope/two
      - name: Build
        run: yarn build:one
      - run: corepack yarn workspace @scope/two build
      - name: Many lines
        run: |
          echo "no yarn here"
  e2e:
    needs: detect-changes
    if: >-
      contains(fromJSON(needs.detect-changes.outputs.affected-targets), 'one') ||
      contains(fromJSON(needs.detect-changes.outputs.affected-targets), 'two')
    steps:
      - run: |
          SHARED='^libs/shared/'
          EXTRA='^apps/extra/'
          RELEVANT="^apps/(one|two)/|\${SHARED}|\${EXTRA}"
          LITERAL='^apps/\${SHARED}'
  other:
    if: always()
`,
};
const empty = { path: ".github/workflows/empty.yml", text: "on: {}\n" };

function workflowWith(text: string) {
    return { path: ".github/workflows/other.yml", text };
}

describe("workflow parsers", () => {
    it("read the trigger paths of one event", () => {
        expect(triggerPaths(workflow, "push")).toEqual(["apps/one/**", "!apps/one/MARKER"]);
        expect(triggerPaths(workflow, "pull_request")).toEqual(["apps/two/**"]);
    });

    it("read commented, double-quoted and bare trigger paths", () => {
        const commented = workflowWith(`on:
  pull_request:
    paths:
      - 'apps/one/**'
      # The webviews it bundles.
      - "apps/two/**"

      - apps/three/** # bare
  schedule:
    - cron: '23 4 * * 1'
`);

        expect(triggerPaths(commented, "pull_request")).toEqual([
            "apps/one/**",
            "apps/two/**",
            "apps/three/**",
        ]);
    });

    it("fails on a trigger path line it cannot read", () => {
        const unreadable = workflowWith(`on:
  push:
    paths:
      - 'apps/one/**'
      [apps/two/**]
`);

        expect(() => triggerPaths(unreadable, "push")).toThrow(
            ".github/workflows/other.yml: cannot read the push path line `      [apps/two/**]`",
        );
    });

    it("expand every shell variable a double-quoted pattern names", () => {
        expect(workflowAssignment(workflow, "SHARED")).toBe("^libs/shared/");
        expect(workflowPattern(workflow, "RELEVANT").test("libs/shared/src/x.ts")).toBe(true);
        expect(workflowPattern(workflow, "RELEVANT").test("apps/extra/src/x.ts")).toBe(true);
        expect(workflowPattern(workflow, "RELEVANT").test("apps/three/src/x.ts")).toBe(false);
    });

    it("leave a single-quoted pattern unexpanded, as the shell does", () => {
        expect(workflowPattern(workflow, "LITERAL").source).toBe("^apps\\/${SHARED}");
    });

    it.each([
        ["|", "yarn build:extra"],
        [">-", "corepack yarn workspace @scope/extra build"],
    ])("fail on a yarn command folded into a run: %s block", (indicator, command) => {
        const mixed = workflowWith(`jobs:
  publish:
    steps:
      - run: yarn workspaces focus root
      - run: yarn build:one
      - run: ${indicator}
          echo building
          ${command}
`);
        const message = `.github/workflows/other.yml runs \`${command}\` in a \`run: ${indicator}\` block; give it a one-line \`run:\``;

        expect(() => focusedWorkspaces(mixed)).toThrow(message);
        expect(() => yarnRunSteps(mixed)).toThrow(message);
    });

    it("read the focused workspaces and the one-line yarn steps", () => {
        expect(focusedWorkspaces(workflow)).toEqual(["root", "@scope/one", "@scope/two"]);
        expect(yarnRunSteps(workflow)).toEqual(["build:one", "workspace @scope/two build"]);
    });

    it("read the Vitest targets a job's condition names", () => {
        expect(jobConditionTargets(workflow, "e2e")).toEqual(["one", "two"]);
    });

    it.each([
        ["triggerPaths", () => triggerPaths(empty, "push"), "has no push paths"],
        ["workflowAssignment", () => workflowAssignment(empty, "X"), "assigns no X"],
        ["focusedWorkspaces", () => focusedWorkspaces(empty), "yarn workspaces focus"],
        ["yarnRunSteps", () => yarnRunSteps(empty), "no one-line"],
        ["jobConditionTargets", () => jobConditionTargets(workflow, "other"), "names no"],
    ])("%s fails on a file without the shape it reads", (_parser, parse, message) => {
        expect(parse).toThrow(message);
    });
});
