import {
    BpmnlintConfig,
    Engine,
    LintResults,
    staticUnresolvedModdleExtensions,
} from "@miragon/bpmn-modeler-types";

import { LintFindingsSource } from "./bpmnlintIndicator";

/** One `.bpmnlintrc` version: its path and exact bytes identify it. */
export interface LintConfigVersion {
    readonly configPath: string;
    readonly rawConfig: string;
    readonly config: BpmnlintConfig;
}

/**
 * Where one editor lints one config version. `token` travels with the in-page
 * instruction and comes back with the webview's results, so a run against an
 * older version can be told apart.
 */
export interface Negotiation extends LintConfigVersion {
    readonly token: string;
}

/** The diagram one lint run saw, and what the run reported. */
export interface LintRunOutput {
    readonly xml: string;
    readonly results: LintResults;
    readonly unresolved: readonly string[];
}

export interface LintFindings extends LintRunOutput {
    readonly source: LintFindingsSource;
}

/** A tier that lints in the webview keeps its last findings to replay on re-activation. */
export type LintSession =
    | { readonly tier: "untracked" }
    | { readonly tier: "off"; readonly settled?: SettledNegotiation }
    | { readonly tier: "failed" }
    | { readonly tier: "default"; readonly lastFindings?: LintFindings }
    | {
          readonly tier: "covered";
          readonly negotiation: Negotiation;
          readonly lastFindings?: LintFindings;
      }
    // The host's first lint is in flight; until it lands, the webview still lints.
    | { readonly tier: "escalating"; readonly negotiation: Negotiation }
    | { readonly tier: "escalated"; readonly negotiation: Negotiation };

/** The tier linting resumes when it is turned back on for the same config version. */
export interface SettledNegotiation {
    readonly tier: "covered" | "escalated";
    readonly negotiation: Negotiation;
}

type InPageSession = Extract<LintSession, { tier: "default" | "covered" | "escalating" }>;

type HostLintedSession = Extract<LintSession, { tier: "escalating" | "escalated" }>;

export type LintSessionEvent =
    | { readonly type: "lintingDisabled" }
    | { readonly type: "noConfigFound" }
    | {
          readonly type: "configRead";
          readonly version: LintConfigVersion;
          // Used only when the version is new, so token minting stays outside the domain.
          readonly freshToken: string;
      }
    | { readonly type: "configFailed" }
    | WebviewLinted
    | { readonly type: "hostLintFinished"; readonly token: string; readonly output: LintRunOutput }
    | { readonly type: "hostLintFailed"; readonly token: string };

interface WebviewLinted {
    readonly type: "webviewLinted";
    readonly output: LintRunOutput;
    readonly platform: Engine | undefined;
    readonly configToken?: string;
    readonly lintingEnabled: boolean;
}

export type LintDropReason =
    | "notInPage"
    | "lintingDisabled"
    | "supersededVersion"
    | "supersededEra"
    | "alreadyEscalated"
    | "supersededRun";

export type LintAction =
    | { readonly kind: "drop"; readonly reason: LintDropReason }
    | { readonly kind: "disable" }
    | { readonly kind: "lintDefaultInPage"; readonly replay?: LintFindings }
    | {
          readonly kind: "lintCoveredInPage";
          readonly negotiation: Negotiation;
          readonly replay?: LintFindings;
      }
    | { readonly kind: "lintOnHost"; readonly negotiation: Negotiation }
    | { readonly kind: "applyInPageFindings"; readonly findings: LintFindings }
    | { readonly kind: "applyHostFindings"; readonly findings: LintFindings }
    | { readonly kind: "fail" };

export interface LintTransition {
    readonly next: LintSession;
    readonly action: LintAction;
}

export const UNTRACKED_LINT_SESSION: LintSession = { tier: "untracked" };

const FAILED: LintSession = { tier: "failed" };

export function lintsInPage(session: LintSession): session is InPageSession {
    return (
        session.tier === "default" || session.tier === "covered" || session.tier === "escalating"
    );
}

export function reduceLintSession(session: LintSession, event: LintSessionEvent): LintTransition {
    switch (event.type) {
        case "lintingDisabled":
            return { next: turnedOff(session), action: { kind: "disable" } };
        case "noConfigFound":
            return {
                next: session.tier === "default" ? session : { tier: "default" },
                action: {
                    kind: "lintDefaultInPage",
                    replay: session.tier === "default" ? session.lastFindings : undefined,
                },
            };
        case "configRead":
            return readConfig(session, event.version, event.freshToken);
        case "configFailed":
            return { next: FAILED, action: { kind: "fail" } };
        case "webviewLinted":
            return receiveWebviewRun(session, event);
        case "hostLintFinished":
            if (!ownsHostLint(session, event.token)) return drop(session, "supersededRun");
            return {
                next: { tier: "escalated", negotiation: session.negotiation },
                action: {
                    kind: "applyHostFindings",
                    findings: {
                        ...event.output,
                        source: { kind: "workspace", configPath: session.negotiation.configPath },
                    },
                },
            };
        case "hostLintFailed":
            if (!ownsHostLint(session, event.token)) return drop(session, "supersededRun");
            return { next: FAILED, action: { kind: "fail" } };
    }
}

function turnedOff(session: LintSession): LintSession {
    const settled = settledNegotiation(session);
    return settled ? { tier: "off", settled } : { tier: "off" };
}

function settledNegotiation(session: LintSession): SettledNegotiation | undefined {
    switch (session.tier) {
        case "off":
            return session.settled;
        case "covered":
            return { tier: "covered", negotiation: session.negotiation };
        case "escalating":
        case "escalated":
            return { tier: "escalated", negotiation: session.negotiation };
        default:
            return undefined;
    }
}

// Escalation only moves forward within one config version.
function readConfig(
    session: LintSession,
    version: LintConfigVersion,
    freshToken: string,
): LintTransition {
    const settled = settledNegotiation(session);
    if (settled && isSameVersion(settled.negotiation, version)) {
        return resume(session, settled);
    }
    const negotiation: Negotiation = { ...version, token: freshToken };
    if (staticUnresolvedModdleExtensions(version.config).length > 0) {
        return {
            next: { tier: lintsInPage(session) ? "escalating" : "escalated", negotiation },
            action: { kind: "lintOnHost", negotiation },
        };
    }
    return {
        next: { tier: "covered", negotiation },
        action: { kind: "lintCoveredInPage", negotiation },
    };
}

function resume(session: LintSession, settled: SettledNegotiation): LintTransition {
    const next = session.tier === "off" ? settled : session;
    if (settled.tier === "escalated") {
        return { next, action: { kind: "lintOnHost", negotiation: settled.negotiation } };
    }
    return {
        next,
        action: {
            kind: "lintCoveredInPage",
            negotiation: settled.negotiation,
            replay: session.tier === "covered" ? session.lastFindings : undefined,
        },
    };
}

function isSameVersion(negotiation: Negotiation, version: LintConfigVersion): boolean {
    return (
        negotiation.configPath === version.configPath && negotiation.rawConfig === version.rawConfig
    );
}

// A covered session accepts only its current token; the default tier only token-less runs.
function receiveWebviewRun(session: LintSession, event: WebviewLinted): LintTransition {
    if (!lintsInPage(session)) return drop(session, "notInPage");
    if (!event.lintingEnabled) return drop(session, "lintingDisabled");
    if (session.tier === "default") {
        if (event.configToken !== undefined) return drop(session, "supersededEra");
        const findings: LintFindings = {
            ...event.output,
            source: { kind: "in-page", platform: event.platform },
        };
        return {
            next: { tier: "default", lastFindings: findings },
            action: { kind: "applyInPageFindings", findings },
        };
    }
    const { negotiation } = session;
    if (event.configToken !== negotiation.token) return drop(session, "supersededVersion");
    if (session.tier === "escalating") return drop(session, "alreadyEscalated");
    if (event.output.unresolved.length > 0) {
        // The host's run replaces these partial findings, so they are never shown.
        return {
            next: { tier: "escalating", negotiation },
            action: { kind: "lintOnHost", negotiation },
        };
    }
    const findings: LintFindings = {
        ...event.output,
        source: { kind: "in-page", platform: event.platform, configPath: negotiation.configPath },
    };
    return {
        next: { tier: "covered", negotiation, lastFindings: findings },
        action: { kind: "applyInPageFindings", findings },
    };
}

function ownsHostLint(session: LintSession, token: string): session is HostLintedSession {
    return (
        (session.tier === "escalating" || session.tier === "escalated") &&
        session.negotiation.token === token
    );
}

function drop(session: LintSession, reason: LintDropReason): LintTransition {
    return { next: session, action: { kind: "drop", reason } };
}
