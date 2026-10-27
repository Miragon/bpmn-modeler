import { BpmnlintConfig, Engine, LintResults } from "@miragon/bpmn-modeler-types";

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
    | { readonly tier: "escalating"; readonly negotiation: Negotiation }
    | { readonly tier: "escalated"; readonly negotiation: Negotiation };

/** The tier linting resumes when it is turned back on for the same config version. */
export interface SettledNegotiation {
    readonly tier: "covered" | "escalated";
    readonly negotiation: Negotiation;
}

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
    | {
          readonly type: "webviewLinted";
          readonly output: LintRunOutput;
          readonly platform: Engine | undefined;
          readonly configToken?: string;
          readonly lintingEnabled: boolean;
      }
    | { readonly type: "hostLintFinished"; readonly token: string; readonly output: LintRunOutput }
    | { readonly type: "hostLintFailed"; readonly token: string };

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

export function lintsInPage(_session: LintSession): boolean {
    return false;
}

export function reduceLintSession(_session: LintSession, _event: LintSessionEvent): LintTransition {
    return { next: UNTRACKED_LINT_SESSION, action: { kind: "fail" } };
}
