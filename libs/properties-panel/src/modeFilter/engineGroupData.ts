/**
 * Hard-coded, version-pinned engine group/entry data for the design-mode filter
 * (issue #1441).
 *
 * These ids are copied by hand from bpmn-js-properties-panel v5.65.0's Camunda 7
 * (`camunda-platform`) and Camunda 8 (`zeebe`) providers. They are NEVER
 * imported from the engine packages — pulling `camunda-platform`/`zeebe` provider
 * code into the design graph is exactly what `check-design-pure-entry.mjs`
 * forbids. When bumping the pinned properties-panel version, re-verify these
 * against the upstream `CamundaPlatformPropertiesProvider` / `ZeebePropertiesProvider`.
 */

/**
 * The engine-neutral group ids the {@link NeutralPropertiesProvider} produces.
 * The design filter's allowlist is these plus the host's custom group ids.
 */
export const NEUTRAL_GROUP_IDS: readonly string[] = [
    "general",
    "documentation",
    "compensation",
    "error",
    "link",
    "message",
    "multiInstance",
    "adHocCompletion",
    "signal",
    "escalation",
    "timer",
];

/**
 * Entry ids the engine providers *append* to neutral groups in place (same
 * group id). Design mode strips them so only the neutral entries remain.
 * - `general`: C7/C8 both insert `versionTag` before `isExecutable`.
 * - `error` / `escalation`: C7 appends the message/variable entries.
 * (`multiInstance`/`timer` are dropped wholesale when an engine is present — see
 * below — so their appended entries need no listing here.)
 */
export const ENGINE_APPENDED_ENTRY_IDS: Readonly<Record<string, readonly string[]>> = {
    general: ["versionTag"],
    error: ["errorMessage", "errorCodeVariable", "errorMessageVariable"],
    escalation: ["escalationCodeVariable"],
};

/**
 * Neutral groups the engine providers *wholesale-replace* (their neutral entries
 * are not restorable by filtering). Per the #1438 decision, an engine modeler in
 * design mode drops these groups entirely; a pure `/design` modeler (no engine)
 * keeps them.
 * - `timer`: replaced by both C7 and C8.
 * - `multiInstance`: replaced by C8, and heavily appended by C7.
 */
export const ENGINE_REPLACED_GROUP_IDS: readonly string[] = ["timer", "multiInstance"];

/** C7 groups all carry the `CamundaPlatform__` prefix. */
const CAMUNDA_PLATFORM_GROUP_PREFIX = "CamundaPlatform__";

/** Element-template groups carry the `ElementTemplates__` prefix. */
const ELEMENT_TEMPLATES_GROUP_PREFIX = "ElementTemplates__";

/** The three prefixed C8 groups; the rest use bare ids (below). */
const ZEEBE_GROUP_PREFIX = "Zeebe__";

/**
 * Bare (unprefixed) C8/zeebe group ids — the provider mostly does not namespace
 * them, so they cannot be detected by prefix.
 */
const BARE_ZEEBE_GROUP_IDS: ReadonlySet<string> = new Set([
    "activeElements",
    "adHocSubProcessImplementation",
    "assignmentDefinition",
    "businessId",
    "businessRuleImplementation",
    "calledDecision",
    "calledElement",
    "condition",
    "form",
    "headers",
    "inputPropagation",
    "inputs",
    "jobPriorityDefinition",
    "outputCollection",
    "outputPropagation",
    "outputs",
    "script",
    "scriptImplementation",
    "taskDefinition",
    "userTaskImplementation",
]);

/** Whether a single group id belongs to an execution engine (C7/C8/templates). */
function isEngineGroupId(id: string): boolean {
    return (
        id.startsWith(CAMUNDA_PLATFORM_GROUP_PREFIX) ||
        id.startsWith(ZEEBE_GROUP_PREFIX) ||
        id.startsWith(ELEMENT_TEMPLATES_GROUP_PREFIX) ||
        BARE_ZEEBE_GROUP_IDS.has(id)
    );
}

/**
 * Whether the incoming group set carries any engine group — the marker that an
 * execution engine provider ran, so design mode must drop the wholesale-replaced
 * neutral groups.
 */
export function hasEngineGroups(groupIds: readonly string[]): boolean {
    return groupIds.some(isEngineGroupId);
}
