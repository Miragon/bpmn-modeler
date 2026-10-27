import { describe, expect, it } from "vitest";

import { BpmnlintConfig } from "@miragon/bpmn-modeler-types";

import {
    LintAction,
    LintConfigVersion,
    LintFindings,
    LintRunOutput,
    LintSession,
    LintSessionEvent,
    lintsInPage,
    Negotiation,
    reduceLintSession,
} from "./LintSession";

const CONFIG_PATH = "/work/.bpmnlintrc";
const RESULTS = {
    "label-required": [{ id: "Task_1", message: "Element requires a label", category: "warn" }],
};
const SKIPPED_RULES = ["acme/naming"];

function version(config: BpmnlintConfig, configPath = CONFIG_PATH): LintConfigVersion {
    return { configPath, rawConfig: JSON.stringify(config), config };
}

const COVERED = version({ extends: "bpmnlint:recommended" });
const EDITED = version({ extends: "bpmnlint:all" });
const MOVED = version({ extends: "bpmnlint:recommended" }, "/work/sub/.bpmnlintrc");
// A string moddle extension is a module path only Node can require.
const NODE_ONLY = version({
    extends: "bpmnlint:recommended",
    moddleExtensions: { acme: "./acme.json" },
});

const OLDER_TOKEN = "lint-cfg-0";
const FRESH_TOKEN = "lint-cfg-2";
const NEGOTIATED: Negotiation = { ...COVERED, token: "lint-cfg-1" };
const NODE_ONLY_NEGOTIATED: Negotiation = { ...NODE_ONLY, token: "lint-cfg-1" };

const OUTPUT: LintRunOutput = { xml: "<xml/>", results: RESULTS, unresolved: [] };
const DEFAULT_FINDINGS: LintFindings = { ...OUTPUT, source: { kind: "in-page", platform: "c7" } };
const COVERED_FINDINGS: LintFindings = {
    ...OUTPUT,
    source: { kind: "in-page", platform: "c7", configPath: CONFIG_PATH },
};
const HOST_FINDINGS: LintFindings = {
    ...OUTPUT,
    source: { kind: "workspace", configPath: CONFIG_PATH },
};

const untracked: LintSession = { tier: "untracked" };
const failed: LintSession = { tier: "failed" };
const off: LintSession = { tier: "off" };
const offCovered: LintSession = {
    tier: "off",
    settled: { tier: "covered", negotiation: NEGOTIATED },
};
const offEscalated: LintSession = {
    tier: "off",
    settled: { tier: "escalated", negotiation: NODE_ONLY_NEGOTIATED },
};
const defaultTier: LintSession = { tier: "default" };
const defaultWithFindings: LintSession = { tier: "default", lastFindings: DEFAULT_FINDINGS };
const covered: LintSession = { tier: "covered", negotiation: NEGOTIATED };
const coveredWithFindings: LintSession = {
    tier: "covered",
    negotiation: NEGOTIATED,
    lastFindings: COVERED_FINDINGS,
};
const escalating: LintSession = { tier: "escalating", negotiation: NEGOTIATED };
const escalated: LintSession = { tier: "escalated", negotiation: NODE_ONLY_NEGOTIATED };

const lintingDisabled: LintSessionEvent = { type: "lintingDisabled" };
const noConfigFound: LintSessionEvent = { type: "noConfigFound" };
const configFailed: LintSessionEvent = { type: "configFailed" };

function configRead(read: LintConfigVersion): LintSessionEvent {
    return { type: "configRead", version: read, freshToken: FRESH_TOKEN };
}

function webviewLinted(
    configToken: string | undefined,
    { unresolved = [] as readonly string[], lintingEnabled = true } = {},
): LintSessionEvent {
    return {
        type: "webviewLinted",
        output: { ...OUTPUT, unresolved },
        platform: "c7",
        configToken,
        lintingEnabled,
    };
}

function hostLintFinished(token: string): LintSessionEvent {
    return { type: "hostLintFinished", token, output: OUTPUT };
}

function hostLintFailed(token: string): LintSessionEvent {
    return { type: "hostLintFailed", token };
}

function freshlyNegotiated(read: LintConfigVersion): Negotiation {
    return { ...read, token: FRESH_TOKEN };
}

interface TransitionCase {
    readonly name: string;
    readonly session: LintSession;
    readonly event: LintSessionEvent;
    readonly next: LintSession;
    readonly action: LintAction;
}

const drop = (reason: Extract<LintAction, { kind: "drop" }>["reason"]): LintAction => ({
    kind: "drop",
    reason,
});

const cases: TransitionCase[] = [
    {
        name: "turns linting off for an editor seen for the first time",
        session: untracked,
        event: lintingDisabled,
        next: off,
        action: { kind: "disable" },
    },
    {
        name: "remembers the covered negotiation while linting is off",
        session: coveredWithFindings,
        event: lintingDisabled,
        next: offCovered,
        action: { kind: "disable" },
    },
    {
        name: "remembers an escalation in flight as escalated while linting is off",
        session: escalating,
        event: lintingDisabled,
        next: { tier: "off", settled: { tier: "escalated", negotiation: NEGOTIATED } },
        action: { kind: "disable" },
    },
    {
        name: "forgets the default findings when linting is turned off",
        session: defaultWithFindings,
        event: lintingDisabled,
        next: off,
        action: { kind: "disable" },
    },
    {
        name: "keeps the settled negotiation when linting is turned off again",
        session: offEscalated,
        event: lintingDisabled,
        next: offEscalated,
        action: { kind: "disable" },
    },
    {
        name: "starts the in-page default for an editor seen for the first time",
        session: untracked,
        event: noConfigFound,
        next: defaultTier,
        action: { kind: "lintDefaultInPage" },
    },
    {
        name: "replays the last default findings when the default is instructed again",
        session: defaultWithFindings,
        event: noConfigFound,
        next: defaultWithFindings,
        action: { kind: "lintDefaultInPage", replay: DEFAULT_FINDINGS },
    },
    {
        name: "hands a covered session back to the default without its covered findings",
        session: coveredWithFindings,
        event: noConfigFound,
        next: defaultTier,
        action: { kind: "lintDefaultInPage" },
    },
    {
        name: "forgets the settled negotiation when the config is gone on re-enable",
        session: offCovered,
        event: noConfigFound,
        next: defaultTier,
        action: { kind: "lintDefaultInPage" },
    },
    {
        name: "negotiates a covered config in-page with a fresh token",
        session: untracked,
        event: configRead(COVERED),
        next: { tier: "covered", negotiation: freshlyNegotiated(COVERED) },
        action: { kind: "lintCoveredInPage", negotiation: freshlyNegotiated(COVERED) },
    },
    {
        name: "escalates a Node-only config without a webview round trip",
        session: untracked,
        event: configRead(NODE_ONLY),
        next: { tier: "escalated", negotiation: freshlyNegotiated(NODE_ONLY) },
        action: { kind: "lintOnHost", negotiation: freshlyNegotiated(NODE_ONLY) },
    },
    {
        name: "keeps the webview's tier live until the host lints a Node-only config",
        session: defaultWithFindings,
        event: configRead(NODE_ONLY),
        next: { tier: "escalating", negotiation: freshlyNegotiated(NODE_ONLY) },
        action: { kind: "lintOnHost", negotiation: freshlyNegotiated(NODE_ONLY) },
    },
    {
        name: "replays the covered findings and reuses the token for an unchanged config",
        session: coveredWithFindings,
        event: configRead(COVERED),
        next: coveredWithFindings,
        action: { kind: "lintCoveredInPage", negotiation: NEGOTIATED, replay: COVERED_FINDINGS },
    },
    {
        name: "renegotiates an edited config with a fresh token and drops the old findings",
        session: coveredWithFindings,
        event: configRead(EDITED),
        next: { tier: "covered", negotiation: freshlyNegotiated(EDITED) },
        action: { kind: "lintCoveredInPage", negotiation: freshlyNegotiated(EDITED) },
    },
    {
        name: "renegotiates the same config found at another path",
        session: covered,
        event: configRead(MOVED),
        next: { tier: "covered", negotiation: freshlyNegotiated(MOVED) },
        action: { kind: "lintCoveredInPage", negotiation: freshlyNegotiated(MOVED) },
    },
    {
        name: "relints an unchanged escalated config on the host",
        session: escalated,
        event: configRead(NODE_ONLY),
        next: escalated,
        action: { kind: "lintOnHost", negotiation: NODE_ONLY_NEGOTIATED },
    },
    {
        name: "stays escalating while the first host lint of an unchanged config runs",
        session: escalating,
        event: configRead(COVERED),
        next: escalating,
        action: { kind: "lintOnHost", negotiation: NEGOTIATED },
    },
    {
        name: "hands an escalated config back to the webview once an edit makes it covered",
        session: escalated,
        event: configRead(COVERED),
        next: { tier: "covered", negotiation: freshlyNegotiated(COVERED) },
        action: { kind: "lintCoveredInPage", negotiation: freshlyNegotiated(COVERED) },
    },
    {
        name: "resumes a covered negotiation with its token when linting is turned back on",
        session: offCovered,
        event: configRead(COVERED),
        next: covered,
        action: { kind: "lintCoveredInPage", negotiation: NEGOTIATED },
    },
    {
        name: "resumes an escalated negotiation on the host when linting is turned back on",
        session: offEscalated,
        event: configRead(NODE_ONLY),
        next: escalated,
        action: { kind: "lintOnHost", negotiation: NODE_ONLY_NEGOTIATED },
    },
    {
        name: "forgets the negotiation when the config cannot be read",
        session: coveredWithFindings,
        event: configFailed,
        next: failed,
        action: { kind: "fail" },
    },
    {
        name: "drops a webview run for an editor the host lints",
        session: escalated,
        event: webviewLinted(NODE_ONLY_NEGOTIATED.token),
        next: escalated,
        action: drop("notInPage"),
    },
    {
        name: "drops a webview run while linting is disabled",
        session: defaultTier,
        event: webviewLinted(undefined, { lintingEnabled: false }),
        next: defaultTier,
        action: drop("lintingDisabled"),
    },
    {
        name: "applies and keeps a default run, even with unresolved rules",
        session: defaultTier,
        event: webviewLinted(undefined, { unresolved: SKIPPED_RULES }),
        next: {
            tier: "default",
            lastFindings: { ...DEFAULT_FINDINGS, unresolved: SKIPPED_RULES },
        },
        action: {
            kind: "applyInPageFindings",
            findings: { ...DEFAULT_FINDINGS, unresolved: SKIPPED_RULES },
        },
    },
    {
        name: "drops a default-tier run that carries a token from a deleted config",
        session: defaultWithFindings,
        event: webviewLinted(OLDER_TOKEN),
        next: defaultWithFindings,
        action: drop("supersededEra"),
    },
    {
        name: "applies and keeps a covered run with the current token",
        session: covered,
        event: webviewLinted(NEGOTIATED.token),
        next: coveredWithFindings,
        action: { kind: "applyInPageFindings", findings: COVERED_FINDINGS },
    },
    {
        name: "drops a covered run with an older token",
        session: coveredWithFindings,
        event: webviewLinted(OLDER_TOKEN),
        next: coveredWithFindings,
        action: drop("supersededVersion"),
    },
    {
        name: "drops a token-less run that reaches a covered session",
        session: covered,
        event: webviewLinted(undefined),
        next: covered,
        action: drop("supersededVersion"),
    },
    {
        name: "escalates to the host when the webview cannot resolve the covered config",
        session: coveredWithFindings,
        event: webviewLinted(NEGOTIATED.token, { unresolved: SKIPPED_RULES }),
        next: escalating,
        action: { kind: "lintOnHost", negotiation: NEGOTIATED },
    },
    {
        name: "drops a second run with the current token while the escalation runs",
        session: escalating,
        event: webviewLinted(NEGOTIATED.token, { unresolved: SKIPPED_RULES }),
        next: escalating,
        action: drop("alreadyEscalated"),
    },
    {
        name: "drops an older run while the escalation runs",
        session: escalating,
        event: webviewLinted(OLDER_TOKEN),
        next: escalating,
        action: drop("supersededVersion"),
    },
    {
        name: "settles the escalation when its host lint lands",
        session: escalating,
        event: hostLintFinished(NEGOTIATED.token),
        next: { tier: "escalated", negotiation: NEGOTIATED },
        action: { kind: "applyHostFindings", findings: HOST_FINDINGS },
    },
    {
        name: "applies a host relint of the escalated config",
        session: escalated,
        event: hostLintFinished(NODE_ONLY_NEGOTIATED.token),
        next: escalated,
        action: { kind: "applyHostFindings", findings: HOST_FINDINGS },
    },
    {
        name: "drops a host lint of an older config version",
        session: escalated,
        event: hostLintFinished(OLDER_TOKEN),
        next: escalated,
        action: drop("supersededRun"),
    },
    {
        name: "drops host findings for a session the webview lints",
        session: covered,
        event: hostLintFinished(NEGOTIATED.token),
        next: covered,
        action: drop("supersededRun"),
    },
    {
        name: "drops a host lint that lands after linting was turned off",
        session: offEscalated,
        event: hostLintFinished(NODE_ONLY_NEGOTIATED.token),
        next: offEscalated,
        action: drop("supersededRun"),
    },
    {
        name: "drops a host lint that lands after the editor closed",
        session: untracked,
        event: hostLintFinished(NEGOTIATED.token),
        next: untracked,
        action: drop("supersededRun"),
    },
    {
        name: "forgets the negotiation when its host lint fails",
        session: escalated,
        event: hostLintFailed(NODE_ONLY_NEGOTIATED.token),
        next: failed,
        action: { kind: "fail" },
    },
    {
        name: "keeps a newer negotiation when an older host lint fails",
        session: escalated,
        event: hostLintFailed(OLDER_TOKEN),
        next: escalated,
        action: drop("supersededRun"),
    },
];

describe("lint session transitions", () => {
    it.each(cases)("$name", ({ session, event, next, action }) => {
        expect(reduceLintSession(session, event)).toEqual({ next, action });
    });
});

describe("lint sessions the webview lints", () => {
    it.each([
        { session: untracked, inPage: false },
        { session: off, inPage: false },
        { session: failed, inPage: false },
        { session: defaultTier, inPage: true },
        { session: covered, inPage: true },
        // The webview keeps linting until the host's first results land.
        { session: escalating, inPage: true },
        { session: escalated, inPage: false },
    ])("$session.tier → $inPage", ({ session, inPage }) => {
        expect(lintsInPage(session)).toBe(inPage);
    });
});
