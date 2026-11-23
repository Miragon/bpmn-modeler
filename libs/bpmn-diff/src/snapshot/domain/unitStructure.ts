import { type ModdleElement, isModdleElement } from "../../moddle/domain/moddleElement";
import { containmentProperties, walkContainment } from "../../parse/domain/moddleContainment";
import { type UnitRule, isDerivedReference, isNameableElement } from "./elementSnippets";

export interface SnapshotReference {
    /** The referring element's type and property, for example `bpmn:SequenceFlow#sourceRef`. */
    readonly property: string;
    /** The unit that holds the referenced element. */
    readonly target: string;
    /** The referenced element's own id when it lies inside `target`. */
    readonly targetPart?: string;
}

/**
 * Every reference of the unit's own subtree to another unit, derived ones left
 * out, in descriptor order, then depth first. `owningUnitIdOf` names the unit
 * holding a referenced element; one it cannot name is left out.
 */
export function unitReferences(
    unit: ModdleElement,
    roots: readonly ModdleElement[],
    isUnit: UnitRule,
    owningUnitIdOf: (target: ModdleElement) => string | undefined,
): SnapshotReference[] {
    const references: SnapshotReference[] = [];
    const visit = (element: ModdleElement): void => {
        for (const property of element.$descriptor.properties ?? []) {
            if (!property.isReference || property.isVirtual || isDerivedReference(property))
                continue;
            const value = element[property.name];
            for (const target of (Array.isArray(value) ? value : [value]).filter(isModdleElement)) {
                const targetUnit = owningUnitIdOf(target);
                if (targetUnit === undefined || targetUnit === unit.id) continue;
                references.push({
                    property: `${element.$type}#${property.name}`,
                    target: targetUnit,
                    ...(target.id === targetUnit || !target.id ? {} : { targetPart: target.id }),
                });
            }
        }
        for (const name of containmentProperties(element)) {
            const value = element[name];
            for (const child of (Array.isArray(value) ? value : [value]).filter(isModdleElement)) {
                if (!isUnit(child)) visit(child);
            }
        }
    };
    for (const root of roots) visit(root);
    return references;
}

/** Ids inside the unit that are no units themselves; called once the units are stripped, so the walk stays inside. */
export function unitParts(unit: ModdleElement, roots: readonly ModdleElement[]): string[] {
    const parts: string[] = [];
    for (const root of roots) {
        walkContainment(root, (element) => {
            if (element !== unit && isNameableElement(element)) parts.push(element.id);
        });
    }
    return parts;
}
