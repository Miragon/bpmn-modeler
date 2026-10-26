import type { BpmnlintConfig, Engine, LintResults } from "@miragon/bpmn-modeler-types";

import type { LintTierInit } from "./LintConfigService";
import type { LintConfigOption } from "./lintConfigResolution";
import type { ModelerMode } from "../mode";

// "in-page-disabled" remembers a user toggle-off, so a re-import cannot silently reactivate linting.
export type LintTier = "external" | "in-page" | "in-page-disabled";

export interface LintTierState {
    readonly tier: LintTier;
    readonly mode: ModelerMode;
    readonly engine?: Engine;
    readonly explicitConfig?: LintConfigOption;
    // A workspace config stays authoritative across mode changes.
    readonly hostConfig?: BpmnlintConfig;
    readonly configToken?: string;
}

export type LintTierEvent =
    | { readonly type: "diagramImported" }
    | {
          readonly type: "inPageLintingRequested";
          readonly config?: BpmnlintConfig;
          readonly configToken?: string;
      }
    | { readonly type: "modeChanged"; readonly mode: ModelerMode }
    | { readonly type: "hostResultsPushed"; readonly results: LintResults | null }
    | { readonly type: "hostDisabledLinting" }
    | { readonly type: "userTurnedLintingOff" }
    | { readonly type: "userTurnedLintingOn" };

export type LintTierEffect =
    | { readonly kind: "buildLinter"; readonly config: BpmnlintConfig }
    | { readonly kind: "activateInPage" }
    | { readonly kind: "renderResults"; readonly results: LintResults | null }
    | { readonly kind: "renderDisabled" };

export interface LintTierTransition {
    readonly state: LintTierState;
    readonly effects: readonly LintTierEffect[];
}

export function startLintTier(init: LintTierInit, diagramLoaded: boolean): LintTierTransition {
    void diagramLoaded;
    return { state: { tier: init.tier, mode: init.mode }, effects: [] };
}

export function reduceLintTier(
    state: LintTierState,
    event: LintTierEvent,
    diagramLoaded: boolean,
): LintTierTransition {
    void event;
    void diagramLoaded;
    return { state, effects: [] };
}
