import type {
    BindingDirection,
    ElementTemplate,
    ImplementationDetail,
    TemplateProperty,
    TemplatePropertyBadge,
} from "./types";

// Mirrors bpmn-js-element-templates' `applyPreset`, so a preview shows the values
// the element will actually be created with.
export function applyTemplatePreset(
    template: ElementTemplate,
    presetId: string | undefined,
): ElementTemplate {
    const preset = presetId ? template.presets?.find(({ id }) => id === presetId) : undefined;
    if (!preset) {
        return template;
    }
    return {
        ...template,
        properties: template.properties.map((property) =>
            property.id !== undefined &&
            Object.prototype.hasOwnProperty.call(preset.properties, property.id)
                ? { ...property, value: preset.properties[property.id] }
                : property,
        ),
    };
}

// Mirrors bpmn-js-element-templates' `getTemplateValue`: a required dropdown
// without a value is created with its first choice, like a <select>.
export function templatePropertyValue(property: TemplateProperty): TemplateProperty["value"] {
    const { choices, optional, type, value } = property;
    if (value === undefined && type === "Dropdown" && !optional && choices?.length) {
        return choices[0].value;
    }
    return value;
}

export function templatePropertyDisplayText(property: TemplateProperty): string | undefined {
    const value = templatePropertyValue(property);
    return value === undefined || value === "" ? undefined : String(value);
}

/**
 * Well-known bindings that identify the implementation of a template.
 *
 * Each entry defines a matcher: either a `property` binding with a specific
 * `name` (C7 pattern), or a direct `bindingType` match (C8 pattern where
 * the binding type itself carries the semantic, e.g. `zeebe:taskDefinition:type`),
 * optionally narrowed to one `binding.property` of that type.
 *
 * Checked in priority order — the first match wins.
 */
const IMPLEMENTATION_BINDINGS: {
    label: string;
    bindingType: string;
    bindingName?: string;
    bindingProperty?: string;
}[] = [
    // C7 bindings (binding.type === "property", identified by binding.name)
    { label: "Topic", bindingType: "property", bindingName: "camunda:topic" },
    {
        label: "Delegate",
        bindingType: "property",
        bindingName: "camunda:delegateExpression",
    },
    { label: "Java class", bindingType: "property", bindingName: "camunda:class" },
    { label: "Expression", bindingType: "property", bindingName: "camunda:expression" },
    { label: "Called element", bindingType: "property", bindingName: "calledElement" },
    // C8 bindings (binding.type carries the semantic directly)
    // Shorthand form: binding.type === "zeebe:taskDefinition:type"
    { label: "Task Type", bindingType: "zeebe:taskDefinition:type" },
    // Long form: binding.type === "zeebe:taskDefinition", binding.property === "type"
    { label: "Task Type", bindingType: "zeebe:taskDefinition", bindingProperty: "type" },
];

/** The labels an implementation detail can carry, each translated where it is shown. */
export const IMPLEMENTATION_LABELS: readonly string[] = [
    ...new Set(IMPLEMENTATION_BINDINGS.map(({ label }) => label)),
];

/**
 * Extracts the primary implementation detail from a template's properties.
 *
 * Searches for well-known binding types and names across both C7 and C8
 * patterns and returns the first match with its value, or `undefined` if no
 * implementation binding is found or the value is empty.
 */
export function extractImplementationDetail(
    properties: TemplateProperty[],
): ImplementationDetail | undefined {
    for (const { label, bindingType, bindingName, bindingProperty } of IMPLEMENTATION_BINDINGS) {
        const value = properties
            .filter(
                (p) =>
                    p.binding.type === bindingType &&
                    (!bindingName || p.binding.name === bindingName) &&
                    (!bindingProperty || p.binding.property === bindingProperty),
            )
            .map(templatePropertyDisplayText)
            .find((text) => text !== undefined);
        if (value) {
            return { label, value };
        }
    }
    return undefined;
}

export function classifyBinding(binding: TemplateProperty["binding"]): BindingDirection {
    const type = binding.type;

    /**
     * Output bindings (C7 + C8)
     */
    if (type === "camunda:out" || type === "camunda:outputParameter" || type === "zeebe:output") {
        return "output";
    }

    /**
     * Input bindings (C7 + C8)
     */
    if (
        type === "camunda:in" ||
        type === "camunda:inputParameter" ||
        type === "camunda:in:businessKey" ||
        type === "zeebe:input"
    ) {
        return "input";
    }

    /**
     * Property bindings (C7 + C8)
     */
    if (type === "property" || type === "zeebe:property") {
        return "property";
    }

    /**
     * C8 task headers are conceptually properties (key-value config on the job)
     */
    if (type === "zeebe:taskHeader") {
        return "property";
    }

    // Everything else: zeebe:taskDefinition, zeebe:taskDefinition:type, camunda:errorEventDefinition, etc.
    return "hidden";
}

/** The non-Hidden template properties, grouped by the preview section they render in. */
interface VisibleProperties {
    properties: TemplateProperty[];
    inputs: TemplateProperty[];
    outputs: TemplateProperty[];
}

export function partitionVisibleProperties(properties: TemplateProperty[]): VisibleProperties {
    const visible = properties.filter((property) => property.type !== "Hidden");
    const inDirection = (direction: BindingDirection) =>
        visible.filter((property) => classifyBinding(property.binding) === direction);
    return {
        properties: inDirection("property"),
        inputs: inDirection("input"),
        outputs: inDirection("output"),
    };
}

export function propertyDisplayLabel(property: TemplateProperty): string | undefined {
    return property.label ?? property.binding.name ?? property.binding.key;
}

export function templatePropertyBadges(property: TemplateProperty): TemplatePropertyBadge[] {
    const badges: TemplatePropertyBadge[] = [];
    if (property.constraints?.notEmpty) badges.push("required");
    if (property.editable === false) badges.push("readOnly");
    if (property.optional) badges.push("optional");
    return badges;
}
