import { MERGE_SIDES, type ElementVersion, type MergeElement, type MergeSide } from "./mergeResult";

/**
 * What an element in the result needs in the result, read from the version its side gives. A `part` is an id inside
 * the target that the target's side in the result must hold: a lane set holding a lane, a data input an association
 * names.
 */
export type Requirement =
    | { readonly kind: "parent"; readonly target: string; readonly part?: string }
    | { readonly kind: "lane"; readonly target: string }
    | {
          readonly kind: "reference";
          readonly target: string;
          readonly property: string;
          readonly part?: string;
      };

export interface Dependent {
    readonly element: MergeElement;
    /** The side whose version of the element holds the requirement. */
    readonly side: MergeSide;
    readonly requirement: Requirement;
}

export function requirementsOf(element: MergeElement, side: MergeSide): readonly Requirement[] {
    const version = element.versions[side];
    return version === undefined
        ? []
        : requirementsOfVersion(version).filter((requirement) => requirement.target !== element.id);
}

function requirementsOfVersion(version: ElementVersion): Requirement[] {
    const requirements: Requirement[] = [];
    if (version.parent !== undefined) {
        requirements.push(
            version.container === undefined
                ? { kind: "parent", target: version.parent }
                : { kind: "parent", target: version.parent, part: version.container },
        );
    }
    for (const lane of version.lanes) {
        requirements.push({ kind: "lane", target: lane });
    }
    for (const { target, property, targetPart } of version.references) {
        requirements.push(
            targetPart === undefined
                ? { kind: "reference", target, property }
                : { kind: "reference", target, property, part: targetPart },
        );
    }
    return requirements;
}

export function requiredPartOf(requirement: Requirement): string | undefined {
    return requirement.kind === "lane" ? undefined : requirement.part;
}

/** Whether the target's version on `side` holds what the requirement names inside it. */
export function holdsRequiredPart(
    target: MergeElement,
    side: MergeSide,
    requirement: Requirement,
): boolean {
    const part = requiredPartOf(requirement);
    return part === undefined || (target.versions[side]?.parts.includes(part) ?? false);
}

export function describeRequirement(requirement: Requirement): string {
    switch (requirement.kind) {
        case "parent":
            return requirement.part === undefined
                ? `lies in ${requirement.target}`
                : `lies in ${requirement.part} inside ${requirement.target}`;
        case "lane":
            return `lies in lane ${requirement.target}`;
        case "reference":
            return requirement.part === undefined
                ? `names ${requirement.target} in ${requirement.property}`
                : `names ${requirement.part} inside ${requirement.target} in ${requirement.property}`;
    }
}

export function dependentsByTarget(
    elements: readonly MergeElement[],
): ReadonlyMap<string, readonly Dependent[]> {
    const dependents = new Map<string, Dependent[]>();
    for (const element of elements) {
        for (const side of MERGE_SIDES) {
            for (const requirement of requirementsOf(element, side)) {
                const ofTarget = dependents.get(requirement.target) ?? [];
                ofTarget.push({ element, side, requirement });
                dependents.set(requirement.target, ofTarget);
            }
        }
    }
    return dependents;
}
