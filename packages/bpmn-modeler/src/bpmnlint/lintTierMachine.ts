import type { BpmnlintConfig, Engine, LintResults } from "@miragon/bpmn-modeler-types";

import { type LintConfigOption, resolveLintConfig } from "./lintConfigResolution";
import type { ModelerMode } from "../mode";

/**
 * The per-instance tier decision, registered as the `lintTier` DI value by
 * {@link createLintModule}. `"external"` renders host-pushed results;
 * `"in-page"` runs {@link BrowserLinter} in the webview against the config
 * `resolveLintConfig` picks from `mode`, `engine`, and the optional `config`.
 * `false`/off never reaches here — a disabled instance registers no lint module
 * at all.
 *
 * `engine` is optional: the engine-neutral Design surface (`/design`) has no
 * execution platform, and its mode default already drops the engine layer. A
 * `config` may be a single {@link BpmnlintConfig} or a per-mode map, so one
 * Camunda-tagged instance can lint Design and Implement differently and
 * re-resolve on a live {@link LintConfigService.setMode}.
 */
export interface LintTierInit {
    tier: "external" | "in-page";
    engine?: Engine;
    mode: ModelerMode;
    config?: LintConfigOption;
}

// "in-page-disabled" remembers a user toggle-off, so a re-import cannot silently reactivate linting.
type LintTier = "external" | "in-page" | "in-page-disabled";

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

const ACTIVATE_IN_PAGE: LintTierEffect = { kind: "activateInPage" };

const RENDER_DISABLED: LintTierEffect = { kind: "renderDisabled" };

export function startLintTier(init: LintTierInit, diagramLoaded: boolean): LintTierTransition {
    const state: LintTierState = {
        tier: init.tier,
        mode: init.mode,
        engine: init.engine,
        explicitConfig: init.config,
    };
    return { state, effects: state.tier === "in-page" ? lintInPage(state, diagramLoaded) : [] };
}

export function reduceLintTier(
    state: LintTierState,
    event: LintTierEvent,
    diagramLoaded: boolean,
): LintTierTransition {
    switch (event.type) {
        case "diagramImported":
            return { state, effects: state.tier === "in-page" ? [ACTIVATE_IN_PAGE] : [] };
        case "inPageLintingRequested":
            return requestInPageLinting(state, event.config, event.configToken, diagramLoaded);
        case "modeChanged":
            return changeMode(state, event.mode, diagramLoaded);
        case "hostResultsPushed":
            return {
                state: { ...state, tier: "external" },
                effects: [{ kind: "renderResults", results: event.results }],
            };
        case "hostDisabledLinting":
            return { state: { ...state, tier: "external" }, effects: [RENDER_DISABLED] };
        case "userTurnedLintingOff":
            return state.tier === "in-page"
                ? { state: { ...state, tier: "in-page-disabled" }, effects: [RENDER_DISABLED] }
                : { state, effects: [] };
        case "userTurnedLintingOn":
            return state.tier === "in-page-disabled" ? turnOnInPage(state) : { state, effects: [] };
    }
}

function requestInPageLinting(
    state: LintTierState,
    config: BpmnlintConfig | undefined,
    configToken: string | undefined,
    diagramLoaded: boolean,
): LintTierTransition {
    if (state.tier === "in-page-disabled") {
        // Only the user re-enables a user-disabled linter; the re-enable lints this config.
        return { state: { ...state, hostConfig: config, configToken }, effects: [] };
    }
    if (state.tier === "in-page" && repeatsLiveConfig(state, config, configToken)) {
        return { state, effects: [] };
    }
    const next: LintTierState = { ...state, tier: "in-page", hostConfig: config, configToken };
    return { state: next, effects: lintInPage(next, diagramLoaded) };
}

// A token names one config version; without one, only a second payload-free reset repeats.
function repeatsLiveConfig(
    state: LintTierState,
    config: BpmnlintConfig | undefined,
    configToken: string | undefined,
): boolean {
    if (configToken !== undefined) {
        return configToken === state.configToken;
    }
    return config === undefined && state.hostConfig === undefined;
}

function changeMode(
    state: LintTierState,
    mode: ModelerMode,
    diagramLoaded: boolean,
): LintTierTransition {
    if (mode === state.mode) {
        return { state, effects: [] };
    }
    const next: LintTierState = { ...state, mode };
    const followsMode = next.tier === "in-page" && next.hostConfig === undefined;
    return { state: next, effects: followsMode ? lintInPage(next, diagramLoaded) : [] };
}

function turnOnInPage(state: LintTierState): LintTierTransition {
    const next: LintTierState = { ...state, tier: "in-page" };
    return { state: next, effects: [buildLinter(next), ACTIVATE_IN_PAGE] };
}

function lintInPage(state: LintTierState, diagramLoaded: boolean): LintTierEffect[] {
    return diagramLoaded ? [buildLinter(state), ACTIVATE_IN_PAGE] : [buildLinter(state)];
}

function buildLinter(state: LintTierState): LintTierEffect {
    return {
        kind: "buildLinter",
        config:
            state.hostConfig ?? resolveLintConfig(state.mode, state.engine, state.explicitConfig),
    };
}
