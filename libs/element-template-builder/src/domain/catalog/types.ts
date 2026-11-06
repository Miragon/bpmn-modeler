import type { Engine } from "@miragon/bpmn-modeler-types";

export type PropertyType = "String" | "Text" | "Hidden" | "Dropdown" | "Boolean" | "Number";

/** One field of a binding object besides its `type`. */
export interface BindingField {
    key: string;
    label: string;
    kind: "text" | "choice" | "flag";
    /** What checking a `flag` field means, shown beside its checkbox. */
    description?: string;
    /** The values a `choice` field offers. */
    options?: readonly string[];
    required?: boolean;
    /** What a new binding starts with. */
    initial?: string | boolean;
}

/** An element type, optionally with the event definition it must carry. */
export interface ElementTypeChoice {
    value: string;
    eventDefinition?: string;
}

/**
 * What the rest of the template must hold for a binding to be valid: an
 * element type, or another property with a given binding.
 */
export type Requirement =
    | { kind: "elementType"; oneOf: readonly ElementTypeChoice[] }
    | { kind: "binding"; binding: Readonly<Record<string, string>>; message: string };

/** How the property's value may use FEEL. */
export type FeelSupport = "none" | "optional" | "required";

export interface BindingSpec {
    type: string;
    label: string;
    fields: readonly BindingField[];
    /** Property types allowed for the binding. */
    types: readonly PropertyType[];
    /** Narrower types, FEEL support and samples for single values of one field. */
    variants?: {
        field: string;
        values: Readonly<Record<string, BindingVariant>>;
    };
    /** FEEL support of the property's value (C8 only). */
    feel?: FeelSupport;
    /** Whether the property may be `optional` (C8 only). */
    optional?: boolean;
    requires?: readonly Requirement[];
    /** The element types the binding works on, where no requirement already says so. */
    elements?: readonly string[];
    /** A valid value for a String, Text or Hidden property of this binding. */
    sample?: string | boolean;
}

export interface BindingVariant {
    types?: readonly PropertyType[];
    feel?: FeelSupport;
    sample?: string | boolean;
}

export interface EngineCatalog {
    engine: Engine;
    propertyTypes: readonly PropertyType[];
    bindings: readonly BindingSpec[];
    /** Binding types the schema knows and the builder only shows, to be edited in the JSON. */
    jsonOnlyBindings: readonly string[];
    /** What to call a JSON-only binding that many templates use. */
    jsonOnlyBindingLabels?: Readonly<Record<string, string>>;
    /** Element types offered for `appliesTo`, most common first. */
    elementTypes: readonly string[];
    /** Whether properties may carry C8's `id`, `condition`, `tooltip`, `feel` and `optional`. */
    propertyExtras: boolean;
}
