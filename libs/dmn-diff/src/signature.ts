import { isModdleElement, type ModdleElement, type PropertyDescriptor } from "./moddleElement";

/** Replaces a property's value in a signature, or drops it when returning `undefined`. */
export type PropertyOverride = (value: unknown) => unknown;

const NONE: Readonly<Record<string, PropertyOverride>> = {};

/**
 * A string that two versions of an element share exactly when nothing a user
 * sees as content differs. Ids are left out: an element is matched by its own
 * id, and nested ids (an entry's, an expression's) change without changing
 * what the element says. `biodi:*` properties only hold column widths.
 */
export function signature(element: ModdleElement | undefined, overrides = NONE): string {
    return JSON.stringify(element ? canonicalElement(element, overrides) : null);
}

/** The signature of each property, by name, for telling which attributes changed. */
export function propertySignatures(element: ModdleElement, overrides = NONE): Map<string, string> {
    const canonical = canonicalElement(element, overrides);
    return new Map(Object.entries(canonical).map(([name, value]) => [name, JSON.stringify(value)]));
}

/** The form a value takes inside a signature, for overrides that keep a value. */
export function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (isModdleElement(value)) return canonicalElement(value, NONE);
    return value;
}

function canonicalElement(
    element: ModdleElement,
    overrides: Readonly<Record<string, PropertyOverride>>,
): Record<string, unknown> {
    const result: Record<string, unknown> = { $type: element.$type };
    for (const property of propertiesOf(element)) {
        if (property.name === "id" || property.isVirtual || property.ns?.prefix === "biodi")
            continue;
        const raw = element[property.name];
        if (raw === undefined || raw === null || (Array.isArray(raw) && raw.length === 0)) continue;
        const override = overrides[property.name];
        const value = override
            ? override(raw)
            : property.isReference
              ? referenceOf(raw)
              : canonical(raw);
        if (value !== undefined) result[property.name] = value;
    }
    for (const [name, value] of Object.entries(element.$attrs ?? {}).sort(([a], [b]) =>
        a.localeCompare(b),
    )) {
        if (!name.startsWith("xmlns")) result[`@${name}`] = value;
    }
    return result;
}

function propertiesOf(element: ModdleElement): readonly PropertyDescriptor[] {
    if (element.$descriptor.isGeneric) {
        return Object.keys(element)
            .filter((name) => name !== "$type")
            .map((name) => ({ name }));
    }
    return element.$descriptor.properties ?? [];
}

function referenceOf(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(referenceOf);
    return isModdleElement(value) ? `#${value.id ?? ""}` : value;
}
