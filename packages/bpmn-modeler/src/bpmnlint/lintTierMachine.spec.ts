// @vitest-environment node
import type { BpmnlintConfig, LintResults } from "@miragon/bpmn-modeler-types";
import { getDefaultLintConfig } from "@miragon/bpmnlint-plugin-rules";
import { describe, expect, it } from "vitest";

import {
    type LintTierEffect,
    type LintTierEvent,
    type LintTierInit,
    type LintTierState,
    reduceLintTier,
    startLintTier,
} from "./lintTierMachine";

const DESIGN_RULES: BpmnlintConfig = { rules: { "label-required": "warn" } };
const IMPLEMENT_RULES: BpmnlintConfig = { rules: { "label-required": "error" } };
const BY_MODE = { design: DESIGN_RULES, implement: IMPLEMENT_RULES };
const WORKSPACE_V1: BpmnlintConfig = { extends: "bpmnlint:recommended" };
const WORKSPACE_V2: BpmnlintConfig = { extends: "bpmnlint:all" };
const PUSHED: LintResults = { "rule-y": [{ id: "B", message: "y", category: "error" }] };

const IN_PAGE: LintTierState = {
    tier: "in-page",
    mode: "implement",
    engine: "c7",
    explicitConfig: BY_MODE,
};
const EXTERNAL: LintTierState = { ...IN_PAGE, tier: "external" };
const DISABLED: LintTierState = { ...IN_PAGE, tier: "in-page-disabled" };
const COVERED_V1 = { hostConfig: WORKSPACE_V1, configToken: "cfg-v1" } as const;

const ACTIVATE: LintTierEffect = { kind: "activateInPage" };
const RENDER_DISABLED: LintTierEffect = { kind: "renderDisabled" };
const build = (config: BpmnlintConfig): LintTierEffect => ({ kind: "buildLinter", config });

interface StartRow {
    readonly behaviour: string;
    readonly init: LintTierInit;
    readonly diagramLoaded: boolean;
    readonly state: LintTierState;
    readonly effects: readonly LintTierEffect[];
}

interface TransitionRow {
    readonly behaviour: string;
    readonly from: LintTierState;
    readonly event: LintTierEvent;
    readonly diagramLoaded?: boolean;
    readonly to: LintTierState;
    readonly effects: readonly LintTierEffect[];
}

const STARTS: StartRow[] = [
    {
        behaviour: "lints a diagram that is already loaded at once",
        init: { tier: "in-page", engine: "c7", mode: "implement", config: BY_MODE },
        diagramLoaded: true,
        state: IN_PAGE,
        effects: [build(IMPLEMENT_RULES), ACTIVATE],
    },
    {
        behaviour: "builds the in-page linter before the first import but waits to activate",
        init: { tier: "in-page", engine: "c7", mode: "implement", config: BY_MODE },
        diagramLoaded: false,
        state: IN_PAGE,
        effects: [build(IMPLEMENT_RULES)],
    },
    {
        behaviour: "starts an external instance idle until the host pushes",
        init: { tier: "external", engine: "c7", mode: "implement" },
        diagramLoaded: true,
        state: { tier: "external", engine: "c7", mode: "implement" },
        effects: [],
    },
    {
        behaviour: "starts an unknown tier from an untyped consumer as external",
        init: { tier: "results" as LintTierInit["tier"], engine: "c7", mode: "implement" },
        diagramLoaded: true,
        state: { tier: "external", engine: "c7", mode: "implement" },
        effects: [],
    },
    {
        behaviour: "lints Implement with the engine-aware default when no config is given",
        init: { tier: "in-page", engine: "c7", mode: "implement" },
        diagramLoaded: false,
        state: { tier: "in-page", engine: "c7", mode: "implement" },
        effects: [build(getDefaultLintConfig({ engine: "c7", preset: "modeling" }))],
    },
    {
        behaviour: "lints Design with the engine-neutral default",
        init: { tier: "in-page", engine: "c7", mode: "design" },
        diagramLoaded: false,
        state: { tier: "in-page", engine: "c7", mode: "design" },
        effects: [build(getDefaultLintConfig({ preset: "modeling" }))],
    },
];

const DIAGRAM_IMPORTS: TransitionRow[] = [
    {
        behaviour: "activates the in-page linter on import",
        from: IN_PAGE,
        event: { type: "diagramImported" },
        to: IN_PAGE,
        effects: [ACTIVATE],
    },
    {
        behaviour: "leaves an external instance to the host's pushes on import",
        from: EXTERNAL,
        event: { type: "diagramImported" },
        to: EXTERNAL,
        effects: [],
    },
    {
        behaviour: "keeps a user-disabled linter off across a re-import",
        from: DISABLED,
        event: { type: "diagramImported" },
        to: DISABLED,
        effects: [],
    },
];

const IN_PAGE_REQUESTS: TransitionRow[] = [
    {
        behaviour: "hands an external instance over to in-page linting with the mode default",
        from: EXTERNAL,
        event: { type: "inPageLintingRequested" },
        to: IN_PAGE,
        effects: [build(IMPLEMENT_RULES), ACTIVATE],
    },
    {
        behaviour: "defers the handback's activation until a diagram is imported",
        from: EXTERNAL,
        event: { type: "inPageLintingRequested" },
        diagramLoaded: false,
        to: IN_PAGE,
        effects: [build(IMPLEMENT_RULES)],
    },
    {
        behaviour: "resolves the handback against a mode stored while external",
        from: { ...EXTERNAL, mode: "design" },
        event: { type: "inPageLintingRequested" },
        to: { ...IN_PAGE, mode: "design" },
        effects: [build(DESIGN_RULES), ACTIVATE],
    },
    {
        behaviour: "lints the workspace config the host hands back",
        from: EXTERNAL,
        event: { type: "inPageLintingRequested", config: WORKSPACE_V1, configToken: "cfg-v1" },
        to: { ...IN_PAGE, ...COVERED_V1 },
        effects: [build(WORKSPACE_V1), ACTIVATE],
    },
    {
        behaviour: "lints a token-less workspace config",
        from: IN_PAGE,
        event: { type: "inPageLintingRequested", config: WORKSPACE_V1 },
        to: { ...IN_PAGE, hostConfig: WORKSPACE_V1 },
        effects: [build(WORKSPACE_V1), ACTIVATE],
    },
    {
        behaviour: "ignores a repeat of the live config version",
        from: { ...IN_PAGE, ...COVERED_V1 },
        event: { type: "inPageLintingRequested", config: WORKSPACE_V1, configToken: "cfg-v1" },
        to: { ...IN_PAGE, ...COVERED_V1 },
        effects: [],
    },
    {
        behaviour: "trusts the token over the payload for the live config version",
        from: { ...IN_PAGE, ...COVERED_V1 },
        event: { type: "inPageLintingRequested", config: WORKSPACE_V2, configToken: "cfg-v1" },
        to: { ...IN_PAGE, ...COVERED_V1 },
        effects: [],
    },
    {
        behaviour: "rebuilds for a new config version",
        from: { ...IN_PAGE, ...COVERED_V1 },
        event: { type: "inPageLintingRequested", config: WORKSPACE_V2, configToken: "cfg-v2" },
        to: { ...IN_PAGE, hostConfig: WORKSPACE_V2, configToken: "cfg-v2" },
        effects: [build(WORKSPACE_V2), ACTIVATE],
    },
    {
        behaviour: "resets a live workspace config to the mode default when the host sends none",
        from: { ...IN_PAGE, ...COVERED_V1 },
        event: { type: "inPageLintingRequested" },
        to: IN_PAGE,
        effects: [build(IMPLEMENT_RULES), ACTIVATE],
    },
    {
        behaviour: "ignores a repeat payload-free handback while the mode default is live",
        from: IN_PAGE,
        event: { type: "inPageLintingRequested" },
        to: IN_PAGE,
        effects: [],
    },
    {
        behaviour: "re-activates the same config version after a host disabled push",
        from: { ...EXTERNAL, ...COVERED_V1 },
        event: { type: "inPageLintingRequested", config: WORKSPACE_V1, configToken: "cfg-v1" },
        to: { ...IN_PAGE, ...COVERED_V1 },
        effects: [build(WORKSPACE_V1), ACTIVATE],
    },
    {
        behaviour: "drops a workspace config kept through a host push when the host sends none",
        from: { ...EXTERNAL, ...COVERED_V1 },
        event: { type: "inPageLintingRequested" },
        to: IN_PAGE,
        effects: [build(IMPLEMENT_RULES), ACTIVATE],
    },
    {
        behaviour: "records the host's config but keeps a user-disabled linter off",
        from: DISABLED,
        event: { type: "inPageLintingRequested", config: WORKSPACE_V1, configToken: "cfg-v1" },
        to: { ...DISABLED, ...COVERED_V1 },
        effects: [],
    },
    {
        behaviour: "records a payload-free reset but keeps a user-disabled linter off",
        from: { ...DISABLED, ...COVERED_V1 },
        event: { type: "inPageLintingRequested" },
        to: DISABLED,
        effects: [],
    },
];

const MODE_CHANGES: TransitionRow[] = [
    {
        behaviour: "ignores a switch to the current mode",
        from: IN_PAGE,
        event: { type: "modeChanged", mode: "implement" },
        to: IN_PAGE,
        effects: [],
    },
    {
        behaviour: "re-resolves the in-page linter for the new mode",
        from: IN_PAGE,
        event: { type: "modeChanged", mode: "design" },
        to: { ...IN_PAGE, mode: "design" },
        effects: [build(DESIGN_RULES), ACTIVATE],
    },
    {
        behaviour: "re-resolves without activating while no diagram is loaded",
        from: IN_PAGE,
        event: { type: "modeChanged", mode: "design" },
        diagramLoaded: false,
        to: { ...IN_PAGE, mode: "design" },
        effects: [build(DESIGN_RULES)],
    },
    {
        behaviour: "keeps a mode-invariant workspace config across a mode switch",
        from: { ...IN_PAGE, ...COVERED_V1 },
        event: { type: "modeChanged", mode: "design" },
        to: { ...IN_PAGE, ...COVERED_V1, mode: "design" },
        effects: [],
    },
    {
        behaviour: "stores the mode for a later handback while external",
        from: EXTERNAL,
        event: { type: "modeChanged", mode: "design" },
        to: { ...EXTERNAL, mode: "design" },
        effects: [],
    },
    {
        behaviour: "stores the mode for the re-enable while user-disabled",
        from: DISABLED,
        event: { type: "modeChanged", mode: "design" },
        to: { ...DISABLED, mode: "design" },
        effects: [],
    },
];

const HOST_PUSHES: TransitionRow[] = [
    {
        behaviour: "lets pushed results take an in-page instance over",
        from: IN_PAGE,
        event: { type: "hostResultsPushed", results: PUSHED },
        to: EXTERNAL,
        effects: [{ kind: "renderResults", results: PUSHED }],
    },
    {
        behaviour: "keeps the workspace config through pushed results",
        from: { ...IN_PAGE, ...COVERED_V1 },
        event: { type: "hostResultsPushed", results: PUSHED },
        to: { ...EXTERNAL, ...COVERED_V1 },
        effects: [{ kind: "renderResults", results: PUSHED }],
    },
    {
        behaviour: "renders pushed results over a user-disabled linter",
        from: DISABLED,
        event: { type: "hostResultsPushed", results: PUSHED },
        to: EXTERNAL,
        effects: [{ kind: "renderResults", results: PUSHED }],
    },
    {
        behaviour: "passes a null push on so the overlays clear",
        from: EXTERNAL,
        event: { type: "hostResultsPushed", results: null },
        to: EXTERNAL,
        effects: [{ kind: "renderResults", results: null }],
    },
    {
        behaviour: "shows the host's disabled state over an in-page instance",
        from: IN_PAGE,
        event: { type: "hostDisabledLinting" },
        to: EXTERNAL,
        effects: [RENDER_DISABLED],
    },
    {
        behaviour: "keeps the workspace config through a host disabled push",
        from: { ...IN_PAGE, ...COVERED_V1 },
        event: { type: "hostDisabledLinting" },
        to: { ...EXTERNAL, ...COVERED_V1 },
        effects: [RENDER_DISABLED],
    },
    {
        behaviour: "shows the host's disabled state over an external instance",
        from: EXTERNAL,
        event: { type: "hostDisabledLinting" },
        to: EXTERNAL,
        effects: [RENDER_DISABLED],
    },
];

const USER_TOGGLES: TransitionRow[] = [
    {
        behaviour: "turns an in-page linter off at once",
        from: IN_PAGE,
        event: { type: "userTurnedLintingOff" },
        to: DISABLED,
        effects: [RENDER_DISABLED],
    },
    {
        behaviour: "leaves an external instance's off switch to the host's answer",
        from: EXTERNAL,
        event: { type: "userTurnedLintingOff" },
        to: EXTERNAL,
        effects: [],
    },
    {
        behaviour: "ignores turning off a linter that is already off",
        from: DISABLED,
        event: { type: "userTurnedLintingOff" },
        to: DISABLED,
        effects: [],
    },
    {
        behaviour: "re-enables with a fresh linter for the mode default",
        from: DISABLED,
        event: { type: "userTurnedLintingOn" },
        to: IN_PAGE,
        effects: [build(IMPLEMENT_RULES), ACTIVATE],
    },
    {
        behaviour: "applies a mode switch made while off on re-enable",
        from: { ...DISABLED, mode: "design" },
        event: { type: "userTurnedLintingOn" },
        to: { ...IN_PAGE, mode: "design" },
        effects: [build(DESIGN_RULES), ACTIVATE],
    },
    {
        behaviour: "re-enables with the workspace config the host handed back while off",
        from: { ...DISABLED, ...COVERED_V1 },
        event: { type: "userTurnedLintingOn" },
        to: { ...IN_PAGE, ...COVERED_V1 },
        effects: [build(WORKSPACE_V1), ACTIVATE],
    },
    {
        behaviour: "activates on re-enable without waiting for an import",
        from: DISABLED,
        event: { type: "userTurnedLintingOn" },
        diagramLoaded: false,
        to: IN_PAGE,
        effects: [build(IMPLEMENT_RULES), ACTIVATE],
    },
    {
        behaviour: "leaves an external instance's on switch to the host",
        from: EXTERNAL,
        event: { type: "userTurnedLintingOn" },
        to: EXTERNAL,
        effects: [],
    },
    {
        behaviour: "ignores turning on a linter that is already on",
        from: IN_PAGE,
        event: { type: "userTurnedLintingOn" },
        to: IN_PAGE,
        effects: [],
    },
];

describe("startLintTier", () => {
    it.each(STARTS)("$behaviour", ({ init, diagramLoaded, state, effects }) => {
        expect(startLintTier(init, diagramLoaded)).toEqual({ state, effects });
    });
});

describe.each([
    { trigger: "a diagram import", rows: DIAGRAM_IMPORTS },
    { trigger: "an in-page request from the host", rows: IN_PAGE_REQUESTS },
    { trigger: "a mode change", rows: MODE_CHANGES },
    { trigger: "a host push", rows: HOST_PUSHES },
    { trigger: "a user toggle", rows: USER_TOGGLES },
])("reduceLintTier on $trigger", ({ rows }) => {
    it.each(rows)("$behaviour", ({ from, event, diagramLoaded = true, to, effects }) => {
        expect(reduceLintTier(from, event, diagramLoaded)).toEqual({ state: to, effects });
    });
});
