import { describe, expect, it } from "vitest";

import { BpmnlintIndicator, indicatorForFindings, LintFindingsSource } from "./bpmnlintIndicator";

const CONFIG_PATH = "/work/.bpmnlintrc";
const SKIPPED_RULES = ["plugin:acme/recommended", "acme/naming"];

interface IndicatorCase {
    readonly name: string;
    readonly source: LintFindingsSource;
    readonly unresolved: readonly string[];
    readonly indicator: BpmnlintIndicator;
}

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
];

describe("bpmnlint indicator for applied findings", () => {
    it.each(cases)("$name", ({ source, unresolved, indicator }) => {
        expect(indicatorForFindings(source, unresolved)).toEqual(indicator);
    });
});
