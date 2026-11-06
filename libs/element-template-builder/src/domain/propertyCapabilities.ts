import type { BindingSpec, FeelSupport, PropertyType } from "./catalog";
import { feelSupport } from "./bindingRules";

interface TypeCapabilities {
    /** Free text, so it takes a placeholder, lengths and a pattern. */
    textual: boolean;
    /** Its value can be a FEEL expression. */
    feel: boolean;
    /** It can name the language of its text. */
    language: boolean;
    /** Users see the field, so it can be read-only or constrained. */
    visible: boolean;
    /** Users can be made to fill it in. */
    requirable: boolean;
}

const BY_TYPE: Readonly<Record<PropertyType, TypeCapabilities>> = {
    String: { textual: true, feel: true, language: false, visible: true, requirable: true },
    Text: { textual: true, feel: true, language: true, visible: true, requirable: true },
    Number: { textual: false, feel: true, language: false, visible: true, requirable: true },
    Boolean: { textual: false, feel: true, language: false, visible: true, requirable: false },
    Dropdown: { textual: false, feel: false, language: false, visible: true, requirable: true },
    Hidden: { textual: false, feel: false, language: false, visible: false, requirable: false },
};

// A type the builder does not know still shows; the validator reports the type itself.
const UNKNOWN_TYPE: TypeCapabilities = {
    textual: false,
    feel: false,
    language: false,
    visible: true,
    requirable: true,
};

export function typeCapabilities(type: unknown): TypeCapabilities {
    return BY_TYPE[type as PropertyType] ?? UNKNOWN_TYPE;
}

export interface PropertyCapabilities extends TypeCapabilities {
    /** How the value may use FEEL, given what both the type and the binding allow. */
    feelUse: FeelSupport;
    /** Whether its value can stay out of the XML while empty. */
    optional: boolean;
}

/** What a property can carry, given its type and its binding. A binding the catalog does not know allows nothing extra. */
export function propertyCapabilities(
    property: Readonly<Record<string, unknown>>,
    spec: BindingSpec | undefined,
): PropertyCapabilities {
    const capabilities = typeCapabilities(property.type);
    const binding = property.binding;
    const support =
        spec && typeof binding === "object" && binding !== null
            ? feelSupport(spec, binding as Readonly<Record<string, unknown>>)
            : "none";
    return {
        ...capabilities,
        feelUse: capabilities.feel ? support : "none",
        optional: spec?.optional === true,
    };
}
