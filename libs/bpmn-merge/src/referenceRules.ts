import {
    MERGE_SIDES,
    type ElementReference,
    type ElementVersion,
    type MergeElement,
    type MergeSide,
} from "./mergeResult";

/**
 * What an element in the result needs in the result, read from the version its side gives. A `part` is an id inside
 * the target that the target's side in the result must hold: a lane set holding a lane, a data input an association
 * names. `uniqueId` and `soleCollaboration` are needs against another element of the result, `target`, that shares
 * the id `part` or a pool of `process`; `requirementsOf` never lists them.
 */
export type Requirement =
    | { readonly kind: "parent"; readonly target: string; readonly part?: string }
    | { readonly kind: "lane"; readonly target: string }
    | {
          readonly kind: "reference";
          readonly target: string;
          readonly property: string;
          readonly part?: string;
      }
    | { readonly kind: "uniqueId"; readonly target: string; readonly part: string }
    | { readonly kind: "soleCollaboration"; readonly target: string; readonly process: string };

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
    return "part" in requirement ? requirement.part : undefined;
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

/** Built once per merge result: the elements by id and every element that needs each target. */
export interface ReferenceIndex {
    readonly elementsById: ReadonlyMap<string, MergeElement>;
    readonly dependentsByTarget: ReadonlyMap<string, readonly Dependent[]>;
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

type ReferenceRole = "process" | "edgeEnd" | "host" | "defaultFlow";

/** References the merge reads beyond the one rule, by the property name of `owner#property`. */
const REFERENCE_ROLES = new Map<string, ReferenceRole>([
    ["processRef", "process"],
    ["sourceRef", "edgeEnd"],
    ["targetRef", "edgeEnd"],
    ["attachedToRef", "host"],
    ["default", "defaultFlow"],
]);

/** `ElementReference.property` reads `owner#property`, as `@miragon/bpmn-modeler-diff` writes it. */
function roleOf(reference: ElementReference): ReferenceRole | undefined {
    return REFERENCE_ROLES.get(reference.property.slice(reference.property.indexOf("#") + 1));
}

/** A participant's process, which its pool draws. */
export function isProcessReference(reference: ElementReference): boolean {
    return roleOf(reference) === "process";
}

export function isEdgeEnd(reference: ElementReference): boolean {
    return roleOf(reference) === "edgeEnd";
}

/** A boundary event's host. */
export function isHostReference(reference: ElementReference): boolean {
    return roleOf(reference) === "host";
}

/** The default flow of a gateway or an activity. */
export function isDefaultFlowReference(reference: ElementReference): boolean {
    return roleOf(reference) === "defaultFlow";
}
