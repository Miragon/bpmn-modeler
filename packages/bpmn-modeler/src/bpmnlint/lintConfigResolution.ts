import type { BpmnlintConfig, Engine } from "@miragon/bpmn-modeler-types";
import { getDefaultLintConfig } from "@miragon/bpmnlint-plugin-rules";

import type { ModelerMode } from "../mode";

/**
 * A per-mode lint config map: a consumer can lint Design and Implement
 * differently on one `createModeler` instance (e.g. the relaxed modeling layer
 * in Design, the engine-aware config in Implement). A missing entry falls back
 * to the mode's zero-config default. Both keys are optional — an empty map is
 * "default in both modes".
 */
export interface LintConfigByMode {
    readonly design?: BpmnlintConfig;
    readonly implement?: BpmnlintConfig;
}

/**
 * The `config` a consumer may hand to the lint tier: either a single
 * {@link BpmnlintConfig} (applied verbatim in both modes) or a
 * {@link LintConfigByMode} map (resolved per mode). Omitting `config` entirely
 * selects the per-mode zero-config default.
 */
export type LintConfigOption = BpmnlintConfig | LintConfigByMode;

/**
 * Discriminates the by-mode map from a single config. A {@link BpmnlintConfig}
 * carries neither a `design` nor an `implement` key (its members are `extends` /
 * `rules` / `resolver` / `moddleExtensions`), so the presence of either key is
 * an unambiguous marker of the map form.
 */
export function isLintConfigByMode(config: LintConfigOption): config is LintConfigByMode {
    return "design" in config || "implement" in config;
}

/**
 * Resolves the effective {@link BpmnlintConfig} for a mode from the consumer's
 * `config` option. The single point that decides *what* to lint with, so
 * {@link BrowserLinter} only has to *run* a config (SRP), and a live mode toggle
 * can re-resolve without rebuilding the option.
 *
 * - single config → applied verbatim in both modes;
 * - by-mode map → the entry for `mode`, else the mode default;
 * - omitted → the mode default.
 *
 * The mode default drops the Camunda engine layer in Design (there is no
 * execution platform to bind on the engine-neutral surface) and keeps it in
 * Implement — `getDefaultLintConfig({ engine: mode === "implement" ? engine : undefined, preset: "modeling" })`.
 */
export function resolveLintConfig(
    mode: ModelerMode,
    engine: Engine | undefined,
    config: LintConfigOption | undefined,
): BpmnlintConfig {
    if (config !== undefined && !isLintConfigByMode(config)) {
        return config;
    }
    const perMode = config?.[mode];
    if (perMode !== undefined) {
        return perMode;
    }
    return getDefaultLintConfig({
        engine: mode === "implement" ? engine : undefined,
        preset: "modeling",
    });
}
