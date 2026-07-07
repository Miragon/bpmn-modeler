/**
 * Element-template engine profile — currently only Camunda contributes a
 * version constraint, mirroring `bpmn-js-element-templates`' `EngineProfile`.
 */
export interface Engines {
    camunda?: string;
}

/**
 * Derives the element-template engine profile from a diagram's execution
 * platform metadata (`modeler:executionPlatform` / `...Version` on
 * `bpmn:Definitions`).
 *
 * This mirrors the bundled library's own `getEnginesConfig` lint rule: only a
 * Camunda Cloud (C8) diagram carrying a version contributes a `camunda` engine.
 * A C7 diagram reports "Camunda Platform", so the platform check makes the
 * C8-only rule implicit; anything else yields `{}`, which the library reads as
 * "no constraints" and clears any previously set value (it re-injects its own
 * internal `elementTemplates` engine key). Deriving from the diagram — not a
 * user setting — matches Camunda Modeler, so templates gate on the same version
 * the file actually targets.
 */
export function deriveEngines(platform: string | undefined, version: string | undefined): Engines {
    if (platform === "Camunda Cloud" && version) {
        return { camunda: version };
    }
    return {};
}
