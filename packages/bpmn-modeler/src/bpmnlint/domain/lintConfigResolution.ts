import type { BpmnlintConfig } from "@miragon/bpmn-modeler-types/domain";

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
