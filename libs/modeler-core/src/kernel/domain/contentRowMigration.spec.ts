import { describe, expect, it } from "vitest";

import { Allowance, allowanceOf, allowanceRowOf } from "./allowance";
import { CodeApproval } from "./codeApproval";
import { contentRowMigrationOf, contentRowsToLocate } from "./contentRowMigration";
import { CodeOrigin } from "./repositoryIdentity";

const MAIN: CodeOrigin = {
    kind: "repository",
    commonDir: "/work/repo/.git",
    worktreeRoot: "/work/repo",
};
const TASK: CodeOrigin = {
    kind: "repository",
    commonDir: "/work/repo/.git",
    worktreeRoot: "/work/task",
};
const PLUGIN_HASH = "0123456789abcdef".repeat(4);
const MAIN_PLUGIN = "/work/repo/.camunda/plugins/trace";
const TASK_PLUGIN = "/work/task/.camunda/plugins/trace";
const MAIN_RULES = "/work/repo/node_modules/bpmnlint-plugin-acme";

const pluginRow = (pluginId: string): CodeApproval => ({ pluginId, contentHash: PLUGIN_HASH });
const rulePackageRow = (pluginId: string): CodeApproval => ({
    pluginId,
    contentHash: "bpmnlint-closure-v1:abc",
});
const pluginAllowance = allowanceOf("plugin", MAIN_PLUGIN, MAIN, "");

describe("contentRowsToLocate", () => {
    it("names each content row's place and kind once, leaving allowances and unknown rows", () => {
        const rows = [
            pluginRow(MAIN_PLUGIN),
            rulePackageRow(MAIN_RULES),
            pluginRow(MAIN_PLUGIN),
            allowanceRowOf(pluginAllowance),
            { pluginId: "/x", contentHash: "unknown" },
        ];

        expect(contentRowsToLocate(rows)).toEqual([
            { id: MAIN_PLUGIN, kind: "plugin" },
            { id: MAIN_RULES, kind: "rulePackage" },
        ]);
    });
});

describe("contentRowMigrationOf", () => {
    it.each<{
        behaviour: string;
        rows: CodeApproval[];
        located: [string, Allowance][];
        change: ReturnType<typeof contentRowMigrationOf>;
    }>([
        {
            behaviour: "rewrites a located content row as its allowance",
            rows: [pluginRow(MAIN_PLUGIN)],
            located: [[MAIN_PLUGIN, pluginAllowance]],
            change: { allow: [allowanceRowOf(pluginAllowance)], revoke: [MAIN_PLUGIN] },
        },
        {
            behaviour: "rewrites two worktrees' rows of one add-on as one allowance",
            rows: [pluginRow(MAIN_PLUGIN), pluginRow(TASK_PLUGIN)],
            located: [
                [MAIN_PLUGIN, pluginAllowance],
                [TASK_PLUGIN, allowanceOf("plugin", TASK_PLUGIN, TASK, "")],
            ],
            change: {
                allow: [allowanceRowOf(pluginAllowance)],
                revoke: [MAIN_PLUGIN, TASK_PLUGIN],
            },
        },
        {
            behaviour: "only drops a content row whose allowance is stored already",
            rows: [allowanceRowOf(pluginAllowance), pluginRow(MAIN_PLUGIN)],
            located: [[MAIN_PLUGIN, pluginAllowance]],
            change: { allow: [], revoke: [MAIN_PLUGIN] },
        },
        {
            behaviour: "leaves a content row whose place it could not locate",
            rows: [pluginRow(MAIN_PLUGIN), pluginRow("/gone/.camunda/plugins/trace")],
            located: [[MAIN_PLUGIN, pluginAllowance]],
            change: { allow: [allowanceRowOf(pluginAllowance)], revoke: [MAIN_PLUGIN] },
        },
        {
            behaviour: "leaves a content row located as another kind",
            rows: [rulePackageRow(MAIN_PLUGIN)],
            located: [[MAIN_PLUGIN, pluginAllowance]],
            change: undefined,
        },
        {
            behaviour: "changes nothing without a content row",
            rows: [allowanceRowOf(pluginAllowance)],
            located: [],
            change: undefined,
        },
    ])("$behaviour", ({ rows, located, change }) => {
        expect(contentRowMigrationOf(rows, new Map(located))).toEqual(change);
    });
});
