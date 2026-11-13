import { describe, expect, it } from "vitest";

import { BpmnlintConfig } from "@miragon/bpmn-modeler-types";

import {
    LintAction,
    LintConfigVersion,
    LintRunOutput,
    LintSession,
    LintSessionEvent,
    lintsInPage,
    reduceLintSession,
    UNTRACKED_LINT_SESSION,
} from "./LintSession";
// Spec-only relative import: no workspace may depend on both halves of the protocol.
import {
    type LintTierEvent,
    type LintTierState,
    lintsInPage as webviewLintsInPage,
    reduceLintTier,
    startLintTier,
} from "../../../../../../packages/bpmn-modeler/src/bpmnlint/lintTierMachine";

/**
 * `deliver` mirrors how the host posts each core action and the webview turns
 * the message into a tier event. While a host lint or a webview request is in
 * flight the page keeps its tier by design, so only settled steps are checked.
 */

function version(config: BpmnlintConfig, configPath = "/work/.bpmnlintrc"): LintConfigVersion {
    return { configPath, rawConfig: JSON.stringify(config), config };
}

const COVERED = version({ extends: "bpmnlint:recommended" });
const EDITED = version({ extends: "bpmnlint:all" });
// A string moddle extension is a module path only Node can require.
const NODE_ONLY = version({
    extends: "bpmnlint:recommended",
    moddleExtensions: { acme: "./acme.json" },
});
const SKIPPED_RULES = ["acme/naming"];

const OUTPUT: LintRunOutput = {
    xml: "<xml/>",
    results: { "label-required": [{ id: "Task_1", message: "Label", category: "warn" }] },
    unresolved: [],
    blocked: [],
};

type HostDecision =
    | { readonly kind: "noConfig" }
    | { readonly kind: "config"; readonly version: LintConfigVersion; readonly freshToken: string }
    | { readonly kind: "configFails" }
    | { readonly kind: "lintingOff" };

type Step =
    | HostDecision
    | { readonly kind: "hostLintFinishes" }
    | { readonly kind: "hostLintFails" }
    | { readonly kind: "staleHostLintFinishes"; readonly token: string }
    | { readonly kind: "webviewLints"; readonly unresolved: readonly string[] }
    | { readonly kind: "webviewReloads" }
    | { readonly kind: "modeChanges"; readonly mode: LintTierState["mode"] }
    | { readonly kind: "userClicks"; readonly enabled: boolean }
    | { readonly kind: "hostAnswers"; readonly decision: HostDecision }
    | {
          readonly kind: "userClicksOnSynchronousHost";
          readonly enabled: boolean;
          readonly decision: HostDecision;
      };

interface Protocol {
    readonly core: LintSession;
    readonly webview: LintTierState;
    /** What the webview's lint bridge echoes on its next run. */
    readonly echoedToken?: string;
    readonly hostLintToken?: string;
    /** Webview requests (a lint switch click, a reload's config request) the host has not answered. */
    readonly unansweredRequests: number;
}

interface SettledView {
    readonly core: LintSession["tier"];
    readonly webview: LintTierState["tier"];
    readonly liveToken?: string;
}

function startWebview(): LintTierState {
    return startLintTier({ tier: "external", engine: "c7", mode: "implement" }, true).state;
}

const START: Protocol = {
    core: UNTRACKED_LINT_SESSION,
    webview: startWebview(),
    unansweredRequests: 0,
};

const noConfig: HostDecision = { kind: "noConfig" };
const configFails: HostDecision = { kind: "configFails" };
const lintingOff: HostDecision = { kind: "lintingOff" };
const hostLintFinishes: Step = { kind: "hostLintFinishes" };
const hostLintFails: Step = { kind: "hostLintFails" };
const webviewReloads: Step = { kind: "webviewReloads" };

function config(read: LintConfigVersion, freshToken: string): HostDecision {
    return { kind: "config", version: read, freshToken };
}

function webviewLints(unresolved: readonly string[] = []): Step {
    return { kind: "webviewLints", unresolved };
}

function staleHostLintFinishes(token: string): Step {
    return { kind: "staleHostLintFinishes", token };
}

function hostAnswers(decision: HostDecision): Step {
    return { kind: "hostAnswers", decision };
}

/** VS Code and IntelliJ answer the switch asynchronously, so the page's own transition runs first. */
function userToggles(enabled: boolean, decision: HostDecision): Step[] {
    return [{ kind: "userClicks", enabled }, hostAnswers(decision)];
}

function webviewRun(configToken: string | undefined, unresolved: readonly string[]) {
    return {
        type: "webviewLinted",
        output: { ...OUTPUT, unresolved },
        platform: "c7",
        configToken,
        lintingEnabled: true,
    } as const satisfies LintSessionEvent;
}

function coreEventOf(decision: HostDecision): LintSessionEvent {
    switch (decision.kind) {
        case "noConfig":
            return { type: "noConfigFound" };
        case "config":
            return {
                type: "configRead",
                version: decision.version,
                freshToken: decision.freshToken,
            };
        case "configFails":
            return { type: "configFailed" };
        case "lintingOff":
            return { type: "lintingDisabled" };
    }
}

function userSwitch(enabled: boolean): LintTierEvent {
    return { type: enabled ? "userTurnedLintingOn" : "userTurnedLintingOff" };
}

function advance(protocol: Protocol, step: Step): Protocol {
    switch (step.kind) {
        case "noConfig":
        case "config":
        case "configFails":
        case "lintingOff":
            return decide(protocol, step);
        case "hostLintFinishes":
            return toCore(
                { ...protocol, hostLintToken: undefined },
                { type: "hostLintFinished", token: hostLintInFlight(protocol), output: OUTPUT },
            );
        case "hostLintFails":
            return toCore(
                { ...protocol, hostLintToken: undefined },
                { type: "hostLintFailed", token: hostLintInFlight(protocol) },
            );
        case "staleHostLintFinishes":
            return toCore(protocol, {
                type: "hostLintFinished",
                token: step.token,
                output: OUTPUT,
            });
        case "webviewLints":
            if (!webviewLintsInPage(protocol.webview)) return protocol;
            return toCore(protocol, webviewRun(protocol.echoedToken, step.unresolved));
        case "webviewReloads":
            return {
                ...protocol,
                webview: startWebview(),
                echoedToken: undefined,
                unansweredRequests: protocol.unansweredRequests + 1,
            };
        case "modeChanges":
            return toWebview(protocol, { type: "modeChanged", mode: step.mode });
        case "userClicks":
            return {
                ...toWebview(protocol, userSwitch(step.enabled)),
                unansweredRequests: protocol.unansweredRequests + 1,
            };
        case "hostAnswers":
            return {
                ...decide(protocol, step.decision),
                unansweredRequests: protocol.unansweredRequests - 1,
            };
        case "userClicksOnSynchronousHost":
            return toWebview(decide(protocol, step.decision), userSwitch(step.enabled));
    }
}

function hostLintInFlight(protocol: Protocol): string {
    if (protocol.hostLintToken === undefined) throw new Error("No host lint is in flight.");
    return protocol.hostLintToken;
}

// Each discovery run supersedes a host lint in flight, as the service's latest-run guard does.
function decide(protocol: Protocol, decision: HostDecision): Protocol {
    return toCore({ ...protocol, hostLintToken: undefined }, coreEventOf(decision));
}

function toCore(protocol: Protocol, event: LintSessionEvent): Protocol {
    const { next, action } = reduceLintSession(protocol.core, event);
    return deliver({ ...protocol, core: next }, action);
}

function toWebview(protocol: Protocol, event: LintTierEvent): Protocol {
    return { ...protocol, webview: reduceLintTier(protocol.webview, event, true).state };
}

function deliver(protocol: Protocol, action: LintAction): Protocol {
    switch (action.kind) {
        case "disable":
            return toWebview(protocol, { type: "hostDisabledLinting" });
        case "lintDefaultInPage":
            return toWebview(
                { ...protocol, echoedToken: undefined },
                { type: "inPageLintingRequested" },
            );
        case "lintCoveredInPage": {
            const { config: covered, token } = action.negotiation;
            return toWebview(
                { ...protocol, echoedToken: token },
                { type: "inPageLintingRequested", config: covered, configToken: token },
            );
        }
        case "lintOnHost":
            return { ...protocol, hostLintToken: action.negotiation.token };
        case "applyHostFindings":
            return toWebview(protocol, {
                type: "hostResultsPushed",
                results: action.findings.results,
            });
        case "fail":
            return toWebview(protocol, { type: "hostResultsPushed", results: null });
        case "drop":
        case "applyInPageFindings":
            return protocol;
    }
}

function isSettled(protocol: Protocol): boolean {
    return protocol.hostLintToken === undefined && protocol.unansweredRequests === 0;
}

function disagreement({ core, webview, echoedToken }: Protocol): string | undefined {
    const coreLintsInPage = lintsInPage(core);
    if (webviewLintsInPage(webview) !== coreLintsInPage) {
        return `the core (${core.tier}) and the webview (${webview.tier}) disagree on who lints`;
    }
    if (!coreLintsInPage) return undefined;
    const { action } = reduceLintSession(core, webviewRun(echoedToken, []));
    return action.kind === "applyInPageFindings"
        ? undefined
        : `the core (${core.tier}) drops the webview's run under ${String(echoedToken)}`;
}

function settledView({ core, webview, echoedToken }: Protocol): SettledView {
    return {
        core: core.tier,
        webview: webview.tier,
        liveToken: webviewLintsInPage(webview) ? echoedToken : undefined,
    };
}

interface AgreementRow {
    readonly behaviour: string;
    readonly steps: readonly Step[];
    readonly settles: SettledView;
}

const DEFAULT_IN_PAGE: SettledView = { core: "default", webview: "in-page" };
const HOST_LINTED: SettledView = { core: "escalated", webview: "external" };
const FAILED: SettledView = { core: "failed", webview: "external" };
const OFF: SettledView = { core: "off", webview: "external" };

function coveredInPage(liveToken: string): SettledView {
    return { core: "covered", webview: "in-page", liveToken };
}

const ROWS: AgreementRow[] = [
    {
        behaviour: "lints the zero-config default in the page",
        steps: [noConfig, webviewLints()],
        settles: DEFAULT_IN_PAGE,
    },
    {
        behaviour: "lints a covered config in the page under its token",
        steps: [config(COVERED, "t1"), webviewLints()],
        settles: coveredInPage("t1"),
    },
    {
        behaviour: "hands a config only Node resolves to the host",
        steps: [config(NODE_ONLY, "t1"), hostLintFinishes],
        settles: HOST_LINTED,
    },
    {
        behaviour: "paints nothing once the host lint fails",
        steps: [config(NODE_ONLY, "t1"), hostLintFails],
        settles: FAILED,
    },
    {
        behaviour: "paints nothing for a config it cannot read",
        steps: [noConfig, configFails],
        settles: FAILED,
    },
    {
        behaviour: "lints a covered config in the page after a failed read",
        steps: [configFails, config(COVERED, "t1")],
        settles: coveredInPage("t1"),
    },
    {
        behaviour: "takes the page back for a covered config after a failed host lint",
        steps: [config(NODE_ONLY, "t1"), hostLintFails, config(COVERED, "t2")],
        settles: coveredInPage("t2"),
    },
    {
        behaviour: "hands a covered config to the host once an in-page run skipped rules",
        steps: [
            config(COVERED, "t1"),
            webviewLints(SKIPPED_RULES),
            webviewLints(),
            hostLintFinishes,
        ],
        settles: HOST_LINTED,
    },
    {
        behaviour: "moves the page to the token of an edited covered config",
        steps: [config(COVERED, "t1"), webviewLints(), config(EDITED, "t2"), webviewLints()],
        settles: coveredInPage("t2"),
    },
    {
        behaviour: "keeps the token of a covered config the host reads again",
        steps: [config(COVERED, "t1"), config(COVERED, "t2"), webviewLints()],
        settles: coveredInPage("t1"),
    },
    {
        behaviour:
            "keeps the page on the old version until the host lint of a Node-only edit lands",
        steps: [config(COVERED, "t1"), config(NODE_ONLY, "t2"), webviewLints(), hostLintFinishes],
        settles: HOST_LINTED,
    },
    {
        behaviour: "hands the default to the host when a Node-only config appears",
        steps: [noConfig, config(NODE_ONLY, "t1"), webviewLints(), hostLintFinishes],
        settles: HOST_LINTED,
    },
    {
        behaviour: "takes the page back for the default when a host-linted config is deleted",
        steps: [config(NODE_ONLY, "t1"), hostLintFinishes, noConfig, webviewLints()],
        settles: DEFAULT_IN_PAGE,
    },
    {
        behaviour: "drops the covered token when the config is deleted",
        steps: [config(COVERED, "t1"), noConfig, webviewLints()],
        settles: DEFAULT_IN_PAGE,
    },
    {
        behaviour: "ignores a host lint that finishes after its config was deleted",
        steps: [noConfig, config(NODE_ONLY, "t1"), noConfig, staleHostLintFinishes("t1")],
        settles: DEFAULT_IN_PAGE,
    },
    {
        behaviour: "lints a covered edit in the page that lands before the host lint",
        steps: [
            config(COVERED, "t1"),
            config(NODE_ONLY, "t2"),
            config(EDITED, "t3"),
            staleHostLintFinishes("t2"),
            webviewLints(),
        ],
        settles: coveredInPage("t3"),
    },
    {
        behaviour: "ignores a host lint that finishes after linting was turned off",
        steps: [
            config(COVERED, "t1"),
            webviewLints(SKIPPED_RULES),
            lintingOff,
            staleHostLintFinishes("t1"),
        ],
        settles: OFF,
    },
    {
        behaviour: "resumes a covered config under its token when linting is turned back on",
        steps: [config(COVERED, "t1"), lintingOff, config(COVERED, "t2"), webviewLints()],
        settles: coveredInPage("t1"),
    },
    {
        behaviour: "resumes host linting when linting is turned back on",
        steps: [
            config(NODE_ONLY, "t1"),
            hostLintFinishes,
            lintingOff,
            config(NODE_ONLY, "t2"),
            hostLintFinishes,
        ],
        settles: HOST_LINTED,
    },
    {
        behaviour:
            "keeps a version an in-page run escalated on the host when linting is turned back on",
        steps: [
            config(COVERED, "t1"),
            webviewLints(SKIPPED_RULES),
            hostLintFinishes,
            lintingOff,
            config(COVERED, "t2"),
            hostLintFinishes,
        ],
        settles: HOST_LINTED,
    },
    {
        behaviour: "resumes the default when linting is turned back on",
        steps: [noConfig, lintingOff, noConfig, webviewLints()],
        settles: DEFAULT_IN_PAGE,
    },
    {
        behaviour: "stops linting in the page once the host answers the user's switch",
        steps: [config(COVERED, "t1"), ...userToggles(false, lintingOff)],
        settles: OFF,
    },
    {
        behaviour: "lints in the page again once the host answers the user's re-enable",
        steps: [
            config(COVERED, "t1"),
            ...userToggles(false, lintingOff),
            ...userToggles(true, config(COVERED, "t2")),
            webviewLints(),
        ],
        settles: coveredInPage("t1"),
    },
    {
        behaviour: "agrees when a synchronous host answers the switch before the page moves",
        steps: [
            noConfig,
            { kind: "userClicksOnSynchronousHost", enabled: false, decision: lintingOff },
            { kind: "userClicksOnSynchronousHost", enabled: true, decision: noConfig },
            webviewLints(),
        ],
        settles: DEFAULT_IN_PAGE,
    },
    {
        behaviour: "agrees when the user re-enables before the host answers the switch-off",
        steps: [
            config(COVERED, "t1"),
            { kind: "userClicks", enabled: false },
            { kind: "userClicks", enabled: true },
            webviewLints(),
            hostAnswers(lintingOff),
            hostAnswers(config(COVERED, "t2")),
        ],
        settles: coveredInPage("t1"),
    },
    {
        behaviour: "keeps a switched-off page off when the host re-reads the config meanwhile",
        steps: [
            config(COVERED, "t1"),
            { kind: "userClicks", enabled: false },
            config(COVERED, "t2"),
            hostAnswers(lintingOff),
        ],
        settles: OFF,
    },
    {
        behaviour: "restores the covered token in a reloaded page",
        steps: [
            config(COVERED, "t1"),
            webviewReloads,
            hostAnswers(config(COVERED, "t2")),
            webviewLints(),
        ],
        settles: coveredInPage("t1"),
    },
    {
        behaviour: "restores the default in a reloaded page",
        steps: [noConfig, webviewReloads, hostAnswers(noConfig), webviewLints()],
        settles: DEFAULT_IN_PAGE,
    },
    {
        behaviour: "lints on the host again for a reloaded page",
        steps: [
            config(NODE_ONLY, "t1"),
            hostLintFinishes,
            webviewReloads,
            hostAnswers(config(NODE_ONLY, "t2")),
            hostLintFinishes,
        ],
        settles: HOST_LINTED,
    },
    {
        behaviour: "keeps a reloaded page off while linting is off",
        steps: [config(COVERED, "t1"), lintingOff, webviewReloads, hostAnswers(lintingOff)],
        settles: OFF,
    },
    {
        behaviour: "keeps the default across a mode change",
        steps: [noConfig, { kind: "modeChanges", mode: "design" }, webviewLints()],
        settles: DEFAULT_IN_PAGE,
    },
    {
        behaviour: "keeps a covered token across a mode change",
        steps: [config(COVERED, "t1"), { kind: "modeChanges", mode: "design" }, webviewLints()],
        settles: coveredInPage("t1"),
    },
];

describe("the core's lint session and the webview's lint tier", () => {
    it.each(ROWS)("$behaviour", ({ steps, settles }) => {
        let protocol = START;
        const disagreements: string[] = [];
        steps.forEach((step, index) => {
            protocol = advance(protocol, step);
            const found = isSettled(protocol) ? disagreement(protocol) : undefined;
            if (found) disagreements.push(`after step ${index + 1} (${step.kind}): ${found}`);
        });

        expect(disagreements).toEqual([]);
        expect(isSettled(protocol)).toBe(true);
        expect(settledView(protocol)).toEqual(settles);
    });
});
