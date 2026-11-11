import type { ElementIdStyle } from "./elementIds";

/** Follow the host's theme, or keep the modeler light. */
export type ColorThemeSetting = "automatic" | "light";

/**
 * Every colour theme a host offers and the core accepts. Not `as const`: the
 * published package re-exports the union through {@link BpmnModelerSetting},
 * and its declaration roll-up cannot follow a type derived from `as const`.
 */
export const COLOR_THEMES: readonly ColorThemeSetting[] = ["automatic", "light"];

export interface BpmnModelerSetting {
    readonly alignToOrigin: boolean;
    readonly showTransactionBoundaries: boolean;
    readonly colorTheme: ColorThemeSetting;
    // BPMN type strings to pin at the top of the append menu palette (max 6).
    readonly favouriteBpmnElements?: string[];
    /** Spelling of IDs generated from names; `typePrefix` when absent. */
    readonly elementIdStyle?: ElementIdStyle;
    /** Rename a still-generated ID whenever its element's name or type changes; off when absent. */
    readonly elementIdsFollowName?: boolean;
}

/**
 * Settings the DMN modeler honours. Deliberately leaner than
 * {@link BpmnModelerSetting}: the decision-table/DRD surfaces only react to the
 * shared `colorTheme` preference, so BPMN-only fields (alignToOrigin,
 * favouriteBpmnElements, …) are omitted rather than carried unused.
 */
export interface DmnModelerSetting {
    readonly colorTheme: ColorThemeSetting;
}
