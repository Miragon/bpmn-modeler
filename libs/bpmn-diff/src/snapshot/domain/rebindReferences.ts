import type { ModdleReference } from "../../moddle/domain/bpmnModdleFactory";
import type { ModdleElement, ModdlePropertyDescriptor } from "../../moddle/domain/moddleElement";

/**
 * Sets each reference the parse met again, in document order, to what
 * `resolve` gives for its id: the parser leaves an unresolved one out, and a
 * collection of references keeps its order only when rebuilt from the list.
 * A reference `resolve` gives nothing for stays out.
 */
export function rebindReferences(
    references: readonly ModdleReference[],
    resolve: (id: string) => ModdleElement | undefined,
): void {
    const collections = new Map<ModdleElement, Map<string, ModdleElement[]>>();
    for (const { element, property, id } of references) {
        const descriptor = propertyNamed(element, property);
        if (descriptor === undefined) continue;
        const target = resolve(id);
        if (!descriptor.isMany) {
            if (target === undefined) delete element[descriptor.name];
            else element[descriptor.name] = target;
            continue;
        }
        const byProperty = collections.get(element) ?? new Map<string, ModdleElement[]>();
        collections.set(element, byProperty);
        const targets = byProperty.get(descriptor.name) ?? [];
        byProperty.set(descriptor.name, targets);
        if (target !== undefined) targets.push(target);
    }
    for (const [element, byProperty] of collections) {
        for (const [name, targets] of byProperty) {
            if (targets.length === 0) delete element[name];
            else element[name] = targets;
        }
    }
}

function propertyNamed(
    element: ModdleElement,
    qualifiedName: string,
): ModdlePropertyDescriptor | undefined {
    return (element.$descriptor.properties ?? []).find(
        (property) => property.ns?.name === qualifiedName,
    );
}
