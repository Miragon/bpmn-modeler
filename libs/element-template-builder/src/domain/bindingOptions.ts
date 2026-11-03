import type { BindingSpec, EngineCatalog } from "../catalog";
import { arrayOf, objectOf, type Json } from "./json";

/** The element types a binding works on; `undefined` for any. */
function elementsOfBinding(spec: BindingSpec): readonly string[] | undefined {
    if (spec.elements) {
        return spec.elements;
    }
    const required = spec.requires?.find((requirement) => requirement.kind === "elementType");
    return required?.kind === "elementType"
        ? required.oneOf.map((choice) => choice.value)
        : undefined;
}

/** Whether a binding works on an element the template applies to or creates. */
export function bindingFits(spec: BindingSpec, template: Json): boolean {
    const elements = elementsOfBinding(spec);
    if (!elements) {
        return true;
    }
    const applied = [objectOf(template.elementType).value, ...arrayOf(template.appliesTo)];
    const known = applied.filter((value) => value !== undefined);
    return known.length === 0 || known.some((value) => elements.includes(value as string));
}

export interface BindingOptions {
    fitting: readonly BindingSpec[];
    /** For another element type than the template's; its problem then says what to do. */
    otherElements: readonly BindingSpec[];
    /** What the schema knows and the builder cannot edit yet. */
    jsonOnly: readonly string[];
}

export function bindingOptions(catalog: EngineCatalog, template: Json): BindingOptions {
    return {
        fitting: catalog.bindings.filter((spec) => bindingFits(spec, template)),
        otherElements: catalog.bindings.filter((spec) => !bindingFits(spec, template)),
        jsonOnly: catalog.jsonOnlyBindings,
    };
}
