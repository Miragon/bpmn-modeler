export type Translate = (template: string, replacements?: Record<string, string>) => string;

// Used when no TranslateModule is registered (third-party bpmn-js setups):
// echoes the template while still resolving {placeholders}, matching diagram-js.
export const fallbackTranslate: Translate = (template, replacements = {}) =>
    template.replace(/{([^}]+)}/g, (_, key: string) => replacements[key] ?? `{${key}}`);

/** A single property (input/output, binding, or user-configurable field) an element template applies. */
export interface TemplateProperty {
    id?: string;
    label?: string;
    type: string;
    value?: string;
    description?: string;
    editable?: boolean;
    optional?: boolean;
    choices?: {
        name: string;
        value: string;
    }[];
    binding: {
        type: string;
        name?: string;
        key?: string;
        property?: string;
        source?: string;
        expression?: boolean;
        target?: string;
        scriptFormat?: string;
    };
    constraints?: {
        notEmpty?: boolean;
    };
}

/** A node of a template's `steps` menu: a category (nested `steps`) or a preset leaf. */
export interface TemplateStep {
    name: string;
    description?: string;
    keywords?: string[];
    presetId?: string;
    steps?: TemplateStep[];
}

/** Property values a leaf step's `presetId` applies on top of the template defaults. */
export interface TemplatePreset {
    id: string;
    properties: Record<string, TemplateProperty["value"]>;
}

/** A Camunda element template as loaded from a JSON file. */
export interface ElementTemplate {
    $schema?: string;
    id: string;
    name: string;
    description?: string;
    documentationRef?: string;
    appliesTo: string[];
    elementType?: { value: string; eventDefinition?: string };
    category?: {
        id: string;
        name: string;
    };
    icon?: {
        contents: string;
    };
    keywords?: string[];
    properties: TemplateProperty[];
    presets?: TemplatePreset[];
    steps?: TemplateStep[];
}

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

/** Binding-type groupings used to classify template properties for the preview panel. */
export type BindingDirection = "input" | "output" | "property" | "hidden";

/**
 * An implementation detail extracted from template properties that
 * identifies the technical binding (topic, delegate, class, called element).
 */
export interface ImplementationDetail {
    label: string;
    value: string;
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
        const prop = properties.find((p) => {
            if (p.binding.type !== bindingType) {
                return false;
            }
            // For "property" bindings, also match on the binding name.
            if (bindingName && p.binding.name !== bindingName) {
                return false;
            }
            if (bindingProperty && p.binding.property !== bindingProperty) {
                return false;
            }
            return !!p.value;
        });
        if (prop) {
            return { label, value: prop.value! };
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
