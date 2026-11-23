import {
    surfaceModeSupports,
    type BpmnlintConfig,
    type Engine,
    type LintResults,
} from "@miragon/bpmn-modeler-types";
import { getDefaultLintConfig } from "@miragon/bpmnlint-plugin-rules";

import type { LintConfigByMode, LintConfigOption } from "./lintConfigResolution";
import type { ModelerMode } from "../mode/mode";

/**
 * What {@link createLintModule} registers as the `lintTier` DI value.
 * `engine` is optional: the engine-neutral Design surface (`/design`) has no
 * execution platform. A `config` may be a single {@link BpmnlintConfig} or a
 * per-mode map, so one Camunda-tagged instance can lint Design and Implement
 * differently and re-resolve on a live mode switch.
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
    readonly engineVersion?: string;
    readonly explicitConfig?: LintConfigOption;
    // A workspace config stays authoritative across mode changes.
    readonly hostConfig?: BpmnlintConfig;
    readonly configToken?: string;
}

export type LintTierEvent =
    | { readonly type: "diagramImported"; readonly engineVersion?: string }
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
    readonly machine: LintTierMachine;
    readonly effects: readonly LintTierEffect[];
}

/**
 * The per-instance tier decision and the config it lints with. `"external"`
 * renders host-pushed results; `"in-page"` runs bpmnlint in the webview. A
 * disabled instance registers no lint module at all, so it never reaches here.
 *
 * In-page, a host config wins; otherwise a single `config` applies verbatim in
 * both modes, a by-mode map gives the entry for the mode, and everything else
 * falls back to the mode default.
 */
export class LintTierMachine {
    private static readonly ACTIVATE_IN_PAGE: LintTierEffect = { kind: "activateInPage" };

    private static readonly RENDER_DISABLED: LintTierEffect = { kind: "renderDisabled" };

    constructor(readonly state: LintTierState) {}

    static start(init: LintTierInit, diagramLoaded: boolean): LintTierTransition {
        const machine = new LintTierMachine({
            // Untyped consumers can pass any tier; everything but "in-page" paints host results.
            tier: init.tier === "in-page" ? "in-page" : "external",
            mode: init.mode,
            engine: init.engine,
            explicitConfig: init.config,
        });
        return { machine, effects: machine.lintsInPage() ? machine.lintInPage(diagramLoaded) : [] };
    }

    // Every other tier replays what was rendered last: host results, or nothing once disabled.
    lintsInPage(): boolean {
        return this.state.tier === "in-page";
    }

    reduce(event: LintTierEvent, diagramLoaded: boolean): LintTierTransition {
        switch (event.type) {
            case "diagramImported":
                return this.importDiagram(event.engineVersion);
            case "inPageLintingRequested":
                return this.requestInPageLinting(event.config, event.configToken, diagramLoaded);
            case "modeChanged":
                return this.changeMode(event.mode, diagramLoaded);
            case "hostResultsPushed":
                return this.moveTo({ tier: "external" }, [
                    { kind: "renderResults", results: event.results },
                ]);
            case "hostDisabledLinting":
                return this.moveTo({ tier: "external" }, [LintTierMachine.RENDER_DISABLED]);
            case "userTurnedLintingOff":
                return this.lintsInPage()
                    ? this.moveTo({ tier: "in-page-disabled" }, [LintTierMachine.RENDER_DISABLED])
                    : this.stay();
            case "userTurnedLintingOn":
                return this.state.tier === "in-page-disabled" ? this.turnOnInPage() : this.stay();
        }
    }

    private importDiagram(engineVersion: string | undefined): LintTierTransition {
        if (!this.lintsInPage()) {
            return this.moveTo({ engineVersion }, []);
        }
        if (engineVersion === this.state.engineVersion) {
            return this.stay([LintTierMachine.ACTIVATE_IN_PAGE]);
        }
        const next = this.with({ engineVersion });
        const effects = next.resolvesOwnConfig()
            ? next.lintInPage(true)
            : [LintTierMachine.ACTIVATE_IN_PAGE];
        return { machine: next, effects };
    }

    private requestInPageLinting(
        config: BpmnlintConfig | undefined,
        configToken: string | undefined,
        diagramLoaded: boolean,
    ): LintTierTransition {
        if (this.state.tier === "in-page-disabled") {
            // Only the user re-enables a user-disabled linter; the re-enable lints this config.
            return this.moveTo({ hostConfig: config, configToken }, []);
        }
        if (this.lintsInPage() && this.repeatsLiveConfig(config, configToken)) {
            return this.stay();
        }
        const next = this.with({ tier: "in-page", hostConfig: config, configToken });
        return { machine: next, effects: next.lintInPage(diagramLoaded) };
    }

    // A token names one config version; without one, only a second payload-free reset repeats.
    private repeatsLiveConfig(
        config: BpmnlintConfig | undefined,
        configToken: string | undefined,
    ): boolean {
        if (configToken !== undefined) {
            return configToken === this.state.configToken;
        }
        return config === undefined && this.state.hostConfig === undefined;
    }

    private changeMode(mode: ModelerMode, diagramLoaded: boolean): LintTierTransition {
        if (mode === this.state.mode) {
            return this.stay();
        }
        const next = this.with({ mode });
        const followsMode = next.lintsInPage() && next.resolvesOwnConfig();
        return { machine: next, effects: followsMode ? next.lintInPage(diagramLoaded) : [] };
    }

    // Rebuild so a mode or host config change made while off takes effect.
    private turnOnInPage(): LintTierTransition {
        const next = this.with({ tier: "in-page" });
        return { machine: next, effects: [next.buildLinter(), LintTierMachine.ACTIVATE_IN_PAGE] };
    }

    private lintInPage(diagramLoaded: boolean): LintTierEffect[] {
        return diagramLoaded
            ? [this.buildLinter(), LintTierMachine.ACTIVATE_IN_PAGE]
            : [this.buildLinter()];
    }

    private buildLinter(): LintTierEffect {
        return { kind: "buildLinter", config: this.state.hostConfig ?? this.resolveConfig() };
    }

    private resolvesOwnConfig(): boolean {
        return this.state.hostConfig === undefined;
    }

    private resolveConfig(): BpmnlintConfig {
        return this.explicitConfigForMode() ?? this.defaultConfig();
    }

    private explicitConfigForMode(): BpmnlintConfig | undefined {
        const { explicitConfig, mode } = this.state;
        if (explicitConfig === undefined) {
            return undefined;
        }
        return LintTierMachine.isByMode(explicitConfig) ? explicitConfig[mode] : explicitConfig;
    }

    // Design has no execution platform to bind, so its default drops the engine layer.
    private defaultConfig(): BpmnlintConfig {
        const { mode, engine, engineVersion } = this.state;
        if (!surfaceModeSupports(mode, "engineLintRules")) {
            return getDefaultLintConfig({ preset: "modeling" });
        }
        return getDefaultLintConfig({ engine, engineVersion, preset: "modeling" });
    }

    // A BpmnlintConfig has neither key, so either one marks the by-mode map.
    private static isByMode(config: LintConfigOption): config is LintConfigByMode {
        return "design" in config || "implement" in config;
    }

    private with(changes: Partial<LintTierState>): LintTierMachine {
        return new LintTierMachine({ ...this.state, ...changes });
    }

    private moveTo(
        changes: Partial<LintTierState>,
        effects: readonly LintTierEffect[],
    ): LintTierTransition {
        return { machine: this.with(changes), effects };
    }

    private stay(effects: readonly LintTierEffect[] = []): LintTierTransition {
        return { machine: this, effects };
    }
}
