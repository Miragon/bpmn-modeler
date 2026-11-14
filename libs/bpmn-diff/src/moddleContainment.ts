import { type ModdleElement, isModdleElement } from "./moddleElement";

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
