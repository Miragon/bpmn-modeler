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
          yarn build:ignored
  e2e:
    needs: detect-changes
    if: >-
      contains(fromJSON(needs.detect-changes.outputs.affected-targets), 'one') ||
      contains(fromJSON(needs.detect-changes.outputs.affected-targets), 'two')
    steps:
      - run: |
          SHARED='^libs/shared/'
          RELEVANT="^apps/(one|two)/|\${SHARED}"
  other:
    if: always()
`,
};
const empty = { path: ".github/workflows/empty.yml", text: "on: {}\n" };

describe("workflow parsers", () => {
    it("read the trigger paths of one event", () => {
        expect(triggerPaths(workflow, "push")).toEqual(["apps/one/**", "!apps/one/MARKER"]);
        expect(triggerPaths(workflow, "pull_request")).toEqual(["apps/two/**"]);
    });

    it("expand a shell variable a double-quoted pattern names", () => {
        expect(workflowAssignment(workflow, "SHARED")).toBe("^libs/shared/");
        expect(workflowPattern(workflow, "RELEVANT").test("libs/shared/src/x.ts")).toBe(true);
        expect(workflowPattern(workflow, "RELEVANT").test("apps/three/src/x.ts")).toBe(false);
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
