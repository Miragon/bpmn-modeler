import type { ElementIdConventionOptions } from "@miragon/bpmn-modeler-types";

/** The rule's name in a config bpmnlint resolved: the package's short name, then the rule. */
export const ELEMENT_ID_NAMING_RULE = "@miragon/rules/element-id-naming";

const QUALIFIER_MODES: ReadonlySet<string> = new Set(["off", "optional", "required"]);

type PrefixMap = NonNullable<ElementIdConventionOptions["prefixes"]>;

function isPrefixMap(value: unknown): value is PrefixMap {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        Object.values(value).every(
            (prefix) => typeof prefix === "string" || prefix === false || prefix === null,
        )
    );
}

/**
 * The options a resolved bpmnlint config gives `element-id-naming`. A setting is
 * a flag (`"warn"`, `2`) or `[flag, options]`; a value the rule could not use is
 * dropped, so its defaults fill in.
 */
export function elementIdConventionOptionsOf(setting: unknown): ElementIdConventionOptions {
    const options = Array.isArray(setting) ? (setting[1] as unknown) : undefined;
    if (typeof options !== "object" || options === null) {
        return {};
    }
    const {
        prefixes,
        case: namingCase,
        eventDefinitionQualifier,
    } = options as Record<string, unknown>;
    return {
        ...(isPrefixMap(prefixes) ? { prefixes } : {}),
        ...(typeof namingCase === "string" ? { case: namingCase } : {}),
        ...(typeof eventDefinitionQualifier === "string" &&
        QUALIFIER_MODES.has(eventDefinitionQualifier)
            ? {
                  eventDefinitionQualifier:
                      eventDefinitionQualifier as ElementIdConventionOptions["eventDefinitionQualifier"],
              }
            : {}),
    };
}
