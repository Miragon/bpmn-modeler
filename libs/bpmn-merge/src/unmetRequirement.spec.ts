import { describe, expect, it } from "vitest";

import type { Requirement } from "./referenceRules";
import { describeUnmetRequirement, type RequirementObstacle } from "./unmetRequirement";

const sourceOfFlow: Requirement = {
    kind: "reference",
    target: "A",
    property: "bpmn:SequenceFlow#sourceRef",
};

const propertyOfTask: Requirement = {
    kind: "reference",
    target: "T",
    property: "bpmn:DataInputAssociation#targetRef",
    part: "Property_1",
};

describe("describeUnmetRequirement", () => {
    it.each<{ requirement: Requirement; obstacle: RequirementObstacle; text: string }>([
        {
            requirement: sourceOfFlow,
            obstacle: { kind: "targetInNoVersion" },
            text: "F (bothAdded) names A in bpmn:SequenceFlow#sourceRef, but no version has A",
        },
        {
            requirement: sourceOfFlow,
            obstacle: { kind: "targetPickedWithout", side: "current", missing: "target" },
            text: "F (bothAdded) names A in bpmn:SequenceFlow#sourceRef, but A is picked from current, which does not have it",
        },
        {
            requirement: propertyOfTask,
            obstacle: { kind: "targetPickedWithout", side: "incoming", missing: "part" },
            text: "F (bothAdded) names Property_1 inside T in bpmn:DataInputAssociation#targetRef, but T is picked from incoming, which does not hold Property_1",
        },
        {
            requirement: sourceOfFlow,
            obstacle: { kind: "targetDroppedByThisPick" },
            text: "F (bothAdded) names A in bpmn:SequenceFlow#sourceRef, but this pick drops A",
        },
        {
            requirement: propertyOfTask,
            obstacle: { kind: "targetTakenByThisPickWithoutPart", side: "incoming" },
            text: "F (bothAdded) names Property_1 inside T in bpmn:DataInputAssociation#targetRef, but this pick takes T from incoming, which does not hold Property_1",
        },
        {
            requirement: sourceOfFlow,
            obstacle: { kind: "sideLacksTarget", side: "incoming", missing: "target" },
            text: "F (bothAdded) names A in bpmn:SequenceFlow#sourceRef, but incoming does not have A",
        },
        {
            requirement: propertyOfTask,
            obstacle: { kind: "sideLacksTarget", side: "current", missing: "part" },
            text: "F (bothAdded) names Property_1 inside T in bpmn:DataInputAssociation#targetRef, but current does not hold Property_1 inside T",
        },
        {
            requirement: sourceOfFlow,
            obstacle: { kind: "targetNotInResult", targetState: "removedByCurrent" },
            text: "F (bothAdded) names A in bpmn:SequenceFlow#sourceRef, but A is not in the result (removedByCurrent)",
        },
        {
            requirement: { kind: "parent", target: "Process", part: "LaneSet_1" },
            obstacle: { kind: "targetTakenWithoutPart", side: "current" },
            text: "F (bothAdded) lies in LaneSet_1 inside Process, but Process is taken from current, which does not hold LaneSet_1",
        },
        {
            requirement: { kind: "lane", target: "Lane_A" },
            obstacle: { kind: "dependentPicked", side: "incoming" },
            text: "F (bothAdded) lies in lane Lane_A and is picked from incoming",
        },
        {
            requirement: { kind: "parent", target: "Process" },
            obstacle: { kind: "dependentPulledInByThisPick" },
            text: "F (bothAdded) lies in Process and this pick pulls it in",
        },
        {
            requirement: { kind: "uniqueId", target: "T", part: "Property_1" },
            obstacle: { kind: "idHeldByAnother", heldAs: "part" },
            text: "F (bothAdded) holds Property_1, but T holds Property_1 too",
        },
        {
            requirement: { kind: "uniqueId", target: "T", part: "T" },
            obstacle: { kind: "idHeldByAnother", heldAs: "element" },
            text: "F (bothAdded) holds T, but the result has an element T",
        },
        {
            requirement: {
                kind: "soleCollaboration",
                target: "Collaboration_2",
                process: "Process_1",
            },
            obstacle: { kind: "processInAnotherCollaboration" },
            text: "F (bothAdded) has a pool of Process_1, but Collaboration_2 has one too and a diagram draws only one collaboration",
        },
    ])("says $obstacle.kind as “$text”", ({ requirement, obstacle, text }) => {
        expect(
            describeUnmetRequirement({
                element: { id: "F", state: "bothAdded" },
                requirement,
                obstacle,
            }),
        ).toBe(text);
    });
});
