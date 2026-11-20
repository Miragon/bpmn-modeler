export type Translate = (template: string, replacements?: Record<string, string>) => string;

/** A single property (input/output, binding, or user-configurable field) an element template applies. */
export interface TemplateProperty {
    id?: string;
    label?: string;
    type: string;
    value?: string | number | boolean;
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

/** A badge a template property shows beside its label in a template's details. */
export type TemplatePropertyBadge = "required" | "readOnly" | "optional";
