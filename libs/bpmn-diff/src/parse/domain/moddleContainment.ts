import {
    type ModdleElement,
    type ModdlePropertyDescriptor,
    isModdleElement,
} from "../../moddle/domain/moddleElement";
import { isNamespaceDeclaration } from "./namespacePrefixes";

/** Visits `root` and every element it contains, never following a reference. */
export function walkContainment(
    root: ModdleElement,
    visit: (element: ModdleElement) => void,
): void {
    const seen = new Set<ModdleElement>();
    const walk = (element: ModdleElement): void => {
        if (seen.has(element)) return;
        seen.add(element);
        visit(element);
        for (const property of containmentProperties(element)) {
            const value = element[property];
            if (Array.isArray(value)) {
                for (const child of value) if (isModdleElement(child)) walk(child);
            } else if (isModdleElement(value)) {
                walk(value);
            }
        }
    };
    walk(root);
}

export function containmentProperties(element: ModdleElement): string[] {
    if (element.$descriptor.isGeneric) return element.$children ? ["$children"] : [];
    return (element.$descriptor.properties ?? [])
        .filter(
            (property) =>
                !property.isVirtual &&
                !property.isReference &&
                !property.isAttr &&
                !property.isAttribute,
        )
        .map((property) => property.name);
}

/** One attribute in the element's start tag, as the serializer writes it. */
export interface OwnAttributeEntry {
    /** The descriptor's property; none for an attribute no descriptor types. */
    readonly property?: ModdlePropertyDescriptor;
    /** Local in the element's own namespace (`errorCode`), else qualified (`camunda:versionTag`). */
    readonly name: string;
    /** A reference as its target's id. */
    readonly value: string;
}

/**
 * The attributes the serializer writes into the element's start tag: a typed
 * one the element holds itself and that differs from the descriptor's
 * default, then its foreign attributes. A reference without `isAttr` is a
 * child element, and namespace declarations are no attributes of the element.
 */
export function* ownAttributeEntries(element: ModdleElement): Generator<OwnAttributeEntry> {
    const ownPrefix = element.$descriptor.ns?.prefix;
    for (const property of element.$descriptor.properties ?? []) {
        if (property.isMany || property.isVirtual || !property.isAttr) continue;
        if (!Object.prototype.hasOwnProperty.call(element, property.name)) continue;
        const raw = element[property.name];
        if (raw === property.default) continue;
        const value = isModdleElement(raw) ? raw.id : attributeText(raw);
        if (value === undefined) continue;
        const qualified =
            property.ns?.prefix === ownPrefix ? property.ns?.localName : property.ns?.name;
        yield { property, name: qualified ?? property.name, value };
    }
    for (const [name, value] of Object.entries(element.$attrs ?? {})) {
        if (!isNamespaceDeclaration(name)) yield { name, value };
    }
}

function attributeText(value: unknown): string | undefined {
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : undefined;
}
