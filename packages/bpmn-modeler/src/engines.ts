import {
    ENGINE_EXECUTION_PLATFORM,
    executionPlatformAttributeNames,
} from "@miragon/bpmn-modeler-types";

/**
 * Element-template engine profile — currently only Camunda contributes a
 * version constraint, mirroring `bpmn-js-element-templates`' `EngineProfile`.
 */
export interface Engines {
    camunda?: string;
}

/**
 * Derives the element-template engine profile from a diagram's execution
 * platform metadata on `bpmn:Definitions`, read under the prefix the diagram
 * binds to the modeler namespace. The bundled moddles do not register that
 * namespace, so moddle keeps the attributes in `$attrs` under the file's own
 * prefix.
 *
 * Like the bundled library's own `getEnginesConfig` lint rule, only a
 * Camunda Cloud (C8) diagram carrying a version contributes a `camunda` engine.
 * A C7 diagram reports "Camunda Platform", so the platform check makes the
 * C8-only rule implicit; anything else yields `{}`, which the library reads as
 * "no constraints" and clears any previously set value (it re-injects its own
 * internal `elementTemplates` engine key). Deriving from the diagram — not a
 * user setting — matches Camunda Modeler, so templates gate on the same version
 * the file actually targets.
 */
export function deriveEngines(definitionsAttributes: Readonly<Record<string, string>>): Engines {
    const names = executionPlatformAttributeNames(
        Object.entries(definitionsAttributes).map(([name, value]) => ({ name, value })),
    );
    const platform = definitionsAttributes[names.platform];
    const version = definitionsAttributes[names.version];
    if (platform === ENGINE_EXECUTION_PLATFORM.c8 && version) {
        return { camunda: version };
    }
    return {};
}
