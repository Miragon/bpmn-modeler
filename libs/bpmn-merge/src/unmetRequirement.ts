import type { ElementState, MergeSide } from "./mergeResult";
import { requiredPartOf, type Requirement } from "./referenceRules";

/** How the clashing id is held by the other element. */
export type IdHolding = "part" | "element";

/** `missing: "part"`: the target is there, without the part the requirement names inside it. */
export type RequirementObstacle =
    | { readonly kind: "targetInNoVersion" }
    | {
          readonly kind: "targetPickedWithout";
          readonly side: MergeSide;
          readonly missing: "target" | "part";
      }
    | { readonly kind: "targetDroppedByThisPick" }
    | { readonly kind: "targetTakenByThisPickWithoutPart"; readonly side: MergeSide }
    | {
          readonly kind: "sideLacksTarget";
          readonly side: MergeSide;
          readonly missing: "target" | "part";
      }
    | { readonly kind: "targetNotInResult"; readonly targetState: ElementState }
    | { readonly kind: "targetTakenWithoutPart"; readonly side: MergeSide }
    | { readonly kind: "dependentPicked"; readonly side: MergeSide }
    | { readonly kind: "dependentPulledInByThisPick" }
    | { readonly kind: "idHeldByAnother"; readonly heldAs: IdHolding }
    | { readonly kind: "processInAnotherCollaboration" };

export interface UnmetRequirement {
    readonly element: { readonly id: string; readonly state: ElementState };
    readonly requirement: Requirement;
    readonly obstacle: RequirementObstacle;
}

/** The English default; a view may describe the same reason in its own words. */
export function describeUnmetRequirement({
    element,
    requirement,
    obstacle,
}: UnmetRequirement): string {
    return `${element.id} (${element.state}) ${describeRequirement(requirement)}${describeObstacle(requirement, obstacle)}`;
}

function describeRequirement(requirement: Requirement): string {
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
        case "uniqueId":
            return `holds ${requirement.part}`;
        case "soleCollaboration":
            return `has a pool of ${requirement.process}`;
    }
}

function describeObstacle(requirement: Requirement, obstacle: RequirementObstacle): string {
    const target = requirement.target;
    const part = requiredPartOf(requirement);
    switch (obstacle.kind) {
        case "targetInNoVersion":
            return `, but no version has ${target}`;
        case "targetPickedWithout":
            return obstacle.missing === "target"
                ? `, but ${target} is picked from ${obstacle.side}, which does not have it`
                : `, but ${target} is picked from ${obstacle.side}, which does not hold ${part}`;
        case "targetDroppedByThisPick":
            return `, but this pick drops ${target}`;
        case "targetTakenByThisPickWithoutPart":
            return `, but this pick takes ${target} from ${obstacle.side}, which does not hold ${part}`;
        case "sideLacksTarget":
            return obstacle.missing === "target"
                ? `, but ${obstacle.side} does not have ${target}`
                : `, but ${obstacle.side} does not hold ${part} inside ${target}`;
        case "targetNotInResult":
            return `, but ${target} is not in the result (${obstacle.targetState})`;
        case "targetTakenWithoutPart":
            return `, but ${target} is taken from ${obstacle.side}, which does not hold ${part}`;
        case "dependentPicked":
            return ` and is picked from ${obstacle.side}`;
        case "dependentPulledInByThisPick":
            return " and this pick pulls it in";
        case "idHeldByAnother":
            return obstacle.heldAs === "part"
                ? `, but ${target} holds ${part} too`
                : `, but the result has an element ${target}`;
        case "processInAnotherCollaboration":
            return `, but ${target} has one too and a diagram draws only one collaboration`;
    }
}
