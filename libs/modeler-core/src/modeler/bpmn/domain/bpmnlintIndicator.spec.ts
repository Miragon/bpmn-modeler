import { describe, expect, it } from "vitest";

import { BpmnlintIndicator, indicatorForFindings, LintFindingsSource } from "./bpmnlintIndicator";
import { BlockedRulePackage } from "./rulePackageApproval";

const CONFIG_PATH = "/work/.bpmnlintrc";
const SKIPPED_RULES = ["plugin:acme/recommended", "acme/naming"];

interface IndicatorCase {
    readonly name: string;
    readonly source: LintFindingsSource;
    readonly unresolved: readonly string[];
    readonly blocked?: readonly BlockedRulePackage[];
    readonly indicator: BpmnlintIndicator;
}

const ACME = "/work/node_modules/bpmnlint-plugin-acme";
const OTHER = "/work/node_modules/bpmnlint-plugin-other";
const blockedPackage = (
    id: string,
    needed: boolean,
    state: BlockedRulePackage["state"] = "new",
): BlockedRulePackage => ({
    id,
    name: id,
    version: "1.0.0",
    allowance: { kind: "rulePackage", host: "", origin: { kind: "folder", path: id }, addOn: "" },
    kind: "package",
    state,
    needed,
});

const workspaceRun: LintFindingsSource = { kind: "workspace", configPath: CONFIG_PATH };
const coveredRun: LintFindingsSource = { kind: "in-page", platform: "c7", configPath: CONFIG_PATH };

const cases: IndicatorCase[] = [
    {
        name: "shows a clean workspace run as active",
        source: workspaceRun,
        unresolved: [],
        indicator: { state: "active", configPath: CONFIG_PATH },
    },
    {
        name: "names the rules a workspace run skipped",
        source: workspaceRun,
        unresolved: SKIPPED_RULES,
        indicator: { state: "unresolved", configPath: CONFIG_PATH, unresolved: SKIPPED_RULES },
    },
    {
        name: "shows a covered in-page run as active",
        source: coveredRun,
        unresolved: [],
        indicator: { state: "active", configPath: CONFIG_PATH },
    },
    {
        name: "keeps a covered in-page run active when it reports unresolved rules",
        source: coveredRun,
        unresolved: SKIPPED_RULES,
        indicator: { state: "active", configPath: CONFIG_PATH },
    },
    {
        name: "shows the bundled default for the diagram's engine",
        source: { kind: "in-page", platform: "c8" },
        unresolved: [],
        indicator: { state: "default", platform: "c8" },
    },
    {
        name: "shows the bundled default without an execution platform",
        source: { kind: "in-page", platform: undefined },
        unresolved: [],
        indicator: { state: "default", platform: undefined },
    },
    {
        name: "keeps the bundled default when an in-page default run reports unresolved rules",
        source: { kind: "in-page", platform: "c7" },
        unresolved: SKIPPED_RULES,
        indicator: { state: "default", platform: "c7" },
    },
    {
        name: "shows a workspace run that skipped rules of a package not allowed yet as blocked, not unresolved",
        source: workspaceRun,
        unresolved: SKIPPED_RULES,
        blocked: [blockedPackage(ACME, true)],
        indicator: {
            state: "blocked",
            configPath: CONFIG_PATH,
            unresolved: SKIPPED_RULES,
            notAllowed: [ACME],
        },
    },
    {
        name: "keeps a package declined this session in the blocked state",
        source: workspaceRun,
        unresolved: SKIPPED_RULES,
        blocked: [blockedPackage(ACME, true, "declined"), blockedPackage(OTHER, true)],
        indicator: {
            state: "blocked",
            configPath: CONFIG_PATH,
            unresolved: SKIPPED_RULES,
            notAllowed: [ACME, OTHER],
        },
    },
    {
        name: "names only the packages whose rules were skipped",
        source: workspaceRun,
        unresolved: SKIPPED_RULES,
        blocked: [blockedPackage(OTHER, false), blockedPackage(ACME, true)],
        indicator: {
            state: "blocked",
            configPath: CONFIG_PATH,
            unresolved: SKIPPED_RULES,
            notAllowed: [ACME],
        },
    },
    {
        name: "shows a clean workspace run as active when the bundle stood in for a package not allowed yet",
        source: workspaceRun,
        unresolved: [],
        blocked: [blockedPackage(ACME, false)],
        indicator: { state: "active", configPath: CONFIG_PATH },
    },
    {
        name: "keeps the unresolved state when only a package the bundle stood in for is not allowed",
        source: workspaceRun,
        unresolved: SKIPPED_RULES,
        blocked: [blockedPackage(ACME, false)],
        indicator: { state: "unresolved", configPath: CONFIG_PATH, unresolved: SKIPPED_RULES },
    },
];

describe("bpmnlint indicator for applied findings", () => {
    it.each(cases)("$name", ({ source, unresolved, blocked = [], indicator }) => {
        expect(indicatorForFindings(source, unresolved, blocked)).toEqual(indicator);
    });
});
