/**
 * Represents a single property defined in an element template.
 *
 * Properties describe the input/output parameters, hidden bindings,
 * and user-configurable fields that a template applies to a BPMN element.
 */
export interface TemplateProperty {
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

/**
 * Represents a Camunda element template as loaded from a JSON file.
 *
 * Element templates define reusable configurations for BPMN elements,
 * including which element types they apply to and what properties they set.
 */
export interface ElementTemplate {
    $schema?: string;
    id: string;
    name: string;
    description?: string;
    documentationRef?: string;
    appliesTo: string[];
    category?: {
        id: string;
        name: string;
    };
    icon?: {
        contents: string;
    };
    keywords?: string[];
    properties: TemplateProperty[];
}

/**
 * Binding type groupings used to classify template properties
 * for the preview panel display.
 */
export type BindingDirection = "input" | "output" | "property" | "hidden";

/**
 * Returns the direction of a template property binding.
 *
 * @param binding The property binding object.
 * @returns The classified direction.
 */
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
 * the binding type itself carries the semantic, e.g. `zeebe:taskDefinition:type`).
 *
 * Checked in priority order — the first match wins.
 */
const IMPLEMENTATION_BINDINGS: {
    label: string;
    bindingType: string;
    bindingName?: string;
}[] = [
    // C7 bindings (binding.type === "property", identified by binding.name)
    { label: "Topic", bindingType: "property", bindingName: "camunda:topic" },
    { label: "Delegate", bindingType: "property", bindingName: "camunda:delegateExpression" },
    { label: "Java Class", bindingType: "property", bindingName: "camunda:class" },
    { label: "Expression", bindingType: "property", bindingName: "camunda:expression" },
    { label: "Called Element", bindingType: "property", bindingName: "calledElement" },
    // C8 bindings (binding.type carries the semantic directly)
    // Shorthand form: binding.type === "zeebe:taskDefinition:type"
    { label: "Task Type", bindingType: "zeebe:taskDefinition:type" },
    // Long form: binding.type === "zeebe:taskDefinition", binding.property === "type"
    { label: "Task Type", bindingType: "zeebe:taskDefinition" },
];

/**
 * Extracts the primary implementation detail from a template's properties.
 *
 * Searches for well-known binding types and names across both C7 and C8
 * patterns and returns the first match with its value. Returns `undefined`
 * if no implementation binding is found or the value is empty.
 *
 * @param properties The template's property array.
 * @returns The implementation detail, or `undefined`.
 */
export function extractImplementationDetail(
    properties: TemplateProperty[],
): ImplementationDetail | undefined {
    for (const { label, bindingType, bindingName } of IMPLEMENTATION_BINDINGS) {
        const prop = properties.find((p) => {
            if (p.binding.type !== bindingType) {
                return false;
            }
            // For "property" bindings, also match on the binding name.
            if (bindingName && p.binding.name !== bindingName) {
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

    // Output bindings (C7 + C8)
    if (type === "camunda:out" || type === "camunda:outputParameter" || type === "zeebe:output") {
        return "output";
    }

    // Input bindings (C7 + C8)
    if (
        type === "camunda:in" ||
        type === "camunda:inputParameter" ||
        type === "camunda:in:businessKey" ||
        type === "zeebe:input"
    ) {
        return "input";
    }

    // Property bindings (C7 + C8)
    if (type === "property" || type === "zeebe:property") {
        return "property";
    }

    // C8 task headers are conceptually properties (key-value config on the job)
    if (type === "zeebe:taskHeader") {
        return "property";
    }

    // Everything else: zeebe:taskDefinition, zeebe:taskDefinition:type, camunda:errorEventDefinition, etc.
    return "hidden";
}
