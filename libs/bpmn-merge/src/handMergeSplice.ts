import {
    type ModdleElement,
    type ModdlePropertyDescriptor,
    type ModdleReference,
    containmentProperties,
    isDerivedReference,
    isModdleElement,
    isNamespaceDeclaration,
    rebindReferences,
    walkContainment,
} from "@miragon/bpmn-modeler-diff";

import type { HandMergeScope } from "./handMerge";

/** A text parsed on its own as one element. */
export interface ParsedElementText {
    readonly element: ModdleElement;
    readonly references: readonly ModdleReference[];
    readonly elementsById: Readonly<Record<string, ModdleElement | undefined>>;
}

const OWN_ATTRIBUTE_CHILDREN: ReadonlySet<string> = new Set([
    "bpmn:documentation",
    "bpmn:extensionElements",
]);

/** Whether a hand-merged text of `scope` gives the property; never the id, a derived reference or a virtual one. */
export function isHandMergedProperty(
    property: ModdlePropertyDescriptor,
    scope: HandMergeScope,
): boolean {
    if (property.isVirtual || property.name === "id" || isDerivedReference(property)) return false;
    return (
        scope === "ownContent" ||
        property.isAttr === true ||
        OWN_ATTRIBUTE_CHILDREN.has(property.ns?.name ?? "")
    );
}

/** What the text of an element of `scope` shows: the id and what the scope gives. */
export function keepsInText(
    scope: HandMergeScope,
): (unit: ModdleElement, property: ModdlePropertyDescriptor) => boolean {
    return (_unit, property) => property.name === "id" || isHandMergedProperty(property, scope);
}

/**
 * Moves what `scope` gives of the parsed text onto `unit` in place, so the
 * diagram and other elements keep pointing at the same object. A reference
 * in the text names the text's own element first, the text's root standing
 * for `unit`, then what `resolveOuter` gives; `unit`'s own elements, which
 * the text leaves out, keep their place in their collections. Namespace
 * declarations are dropped: the document declares them.
 */
export function spliceHandMergedText(
    unit: ModdleElement,
    text: ParsedElementText,
    scope: HandMergeScope,
    isUnit: (element: ModdleElement) => boolean,
    resolveOuter: (id: string) => ModdleElement | undefined,
): void {
    const merged = text.element;
    rebindReferences(text.references, (id) => {
        const inner = text.elementsById[id];
        if (inner === merged) return unit;
        return inner ?? resolveOuter(id);
    });
    walkContainment(merged, dropNamespaceDeclarations);
    const containment = new Set(containmentProperties(unit));
    for (const property of unit.$descriptor.properties ?? []) {
        if (!isHandMergedProperty(property, scope)) continue;
        const name = property.name;
        const value = Object.prototype.hasOwnProperty.call(merged, name) ? merged[name] : undefined;
        if (containment.has(name) && property.isMany) {
            const items = keepingOwnElements(unit[name], value, isUnit);
            items.forEach((item) => adopt(item, unit));
            if (items.length === 0) delete unit[name];
            else unit[name] = items;
        } else if (value === undefined) {
            delete unit[name];
        } else {
            unit[name] = value;
            if (containment.has(name)) adopt(value, unit);
        }
    }
    replaceForeignAttributes(unit, merged.$attrs ?? {});
}

/** The text's items in the places of the unit's other items, so a text equal to the unit keeps every position. */
function keepingOwnElements(
    unitItems: unknown,
    textItems: unknown,
    isUnit: (element: ModdleElement) => boolean,
): unknown[] {
    const pending = Array.isArray(textItems) ? [...textItems] : [];
    const items: unknown[] = [];
    for (const item of Array.isArray(unitItems) ? unitItems : []) {
        if (isModdleElement(item) && isUnit(item)) items.push(item);
        else if (pending.length > 0) items.push(pending.shift());
    }
    return [...items, ...pending];
}

function adopt(item: unknown, parent: ModdleElement): void {
    if (isModdleElement(item)) item.$parent = parent;
}

/** The text's foreign attributes, in the unit's order where the unit has them; moddle gives `$attrs` no setter. */
function replaceForeignAttributes(unit: ModdleElement, fromText: Record<string, string>): void {
    const attributes = unit.$attrs!;
    const order = [
        ...Object.keys(attributes).filter((name) => name in fromText),
        ...Object.keys(fromText).filter((name) => !(name in attributes)),
    ].filter((name) => !isNamespaceDeclaration(name));
    for (const name of Object.keys(attributes)) delete attributes[name];
    for (const name of order) attributes[name] = fromText[name]!;
}

function dropNamespaceDeclarations(element: ModdleElement): void {
    const attributes: Record<string, unknown> = element.$descriptor.isGeneric
        ? element
        : (element.$attrs ?? {});
    for (const name of Object.keys(attributes)) {
        if (isNamespaceDeclaration(name)) delete attributes[name];
    }
}
