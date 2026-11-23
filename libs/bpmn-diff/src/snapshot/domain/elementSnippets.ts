import { trackedElementOf } from "../../compare/domain/trackedElements";
import {
    type ModdleElement,
    type ModdlePropertyDescriptor,
    isModdleElement,
    isType,
} from "../../moddle/domain/moddleElement";
import { containmentProperties } from "../../parse/domain/moddleContainment";

export type UnitRule = (element: ModdleElement) => boolean;

const DERIVED_REFERENCES = new Set([
    "bpmn:incoming",
    "bpmn:outgoing",
    "bpmn:flowNodeRef",
    "bpmn:boundaryEventRefs",
]);

/** A reference the modeler derives from other elements: incoming, outgoing, flowNodeRef, boundaryEventRefs. */
export function isDerivedReference(property: ModdlePropertyDescriptor): boolean {
    const qualifiedName = property.ns?.name;
    return qualifiedName !== undefined && DERIVED_REFERENCES.has(qualifiedName);
}

export function deleteDerivedReferences(element: ModdleElement): void {
    for (const property of element.$descriptor.properties ?? []) {
        if (isDerivedReference(property)) delete element[property.name];
    }
}

export function isSemanticElement(element: ModdleElement): boolean {
    return isType(element, "bpmn:BaseElement") && !isType(element, "bpmn:Definitions");
}

/** The diff's rule: an element whose changes the diff reports under its own id. */
export function isDiffUnit(element: ModdleElement): boolean {
    return trackedElementOf(element) === element;
}

/** What a unit or a part can be: nothing can name an element without an id. */
export function isNameableElement(
    element: ModdleElement,
): element is ModdleElement & { id: string } {
    return isSemanticElement(element) && typeof element.id === "string";
}

/**
 * Whatever `isUnit` says, an element without an id stays part of its
 * enclosing unit instead of vanishing from every snapshot.
 */
export function unitRuleRequiringId(isUnit: UnitRule): UnitRule {
    return (element) => isNameableElement(element) && isUnit(element);
}

/** Declaring sources first, then the document, so its own prefixes fill the gaps. */
export function prefixSourcesWith(
    prefixSources: readonly string[],
    xml: string,
): readonly string[] {
    return prefixSources.includes(xml) ? prefixSources : [...prefixSources, xml];
}

/**
 * `unit` and, for a participant, the process the diff folds into it when that
 * process is no unit of its own. Read before any strip: the fold looks at the
 * definitions' root elements.
 */
export function snippetRootsOf(unit: ModdleElement, isUnit: UnitRule): ModdleElement[] {
    const pooledProcess = unit.processRef;
    return isModdleElement(pooledProcess) &&
        !isUnit(pooledProcess) &&
        trackedElementOf(pooledProcess) === unit
        ? [unit, pooledProcess]
        : [unit];
}

/**
 * Removes every unit from the collections of `elements`, which the caller
 * collects before: a walk that strips as it goes never reaches the children
 * it removed. BPMN contains units only in collections.
 */
export function stripUnits(elements: readonly ModdleElement[], isUnit: UnitRule): void {
    const isUnitChild = (child: unknown) =>
        isModdleElement(child) && isSemanticElement(child) && isUnit(child);
    for (const element of elements) {
        for (const property of containmentProperties(element)) {
            const value = element[property];
            if (!Array.isArray(value)) continue;
            const kept = value.filter((child) => !isUnitChild(child));
            if (kept.length === 0) delete element[property];
            else if (kept.length !== value.length) element[property] = kept;
        }
    }
}
