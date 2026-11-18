import { describe, expect, it } from "vitest";

import { describeHandMergeRefusal, type HandMergeRefusal, handMergeScopeOf } from "./handMerge";

describe("describeHandMergeRefusal", () => {
    it.each<{ readonly refusal: HandMergeRefusal; readonly text: string }>([
        { refusal: { kind: "conflictMarkersLeft" }, text: "conflict markers" },
        { refusal: { kind: "unparsable", detail: "unexpected end" }, text: "unexpected end" },
        { refusal: { kind: "notOneElement", found: 2 }, text: "2 elements" },
        {
            refusal: { kind: "typeChanged", expected: "bpmn:UserTask", found: "bpmn:Task" },
            text: "a bpmn:Task, not a bpmn:UserTask",
        },
        { refusal: { kind: "idChanged", expected: "Task_1" }, text: "no id; it must keep Task_1" },
        {
            refusal: { kind: "idChanged", expected: "Task_1", found: "Task_2" },
            text: "the id Task_2; it must keep Task_1",
        },
        { refusal: { kind: "holdsElementsOfTheirOwn", ids: ["Task_2"] }, text: "Task_2" },
        {
            refusal: { kind: "beyondOwnAttributes", properties: ["bpmn:laneSets"] },
            text: "not bpmn:laneSets",
        },
        { refusal: { kind: "unknownNamespace", namespaces: ["urn:x"] }, text: "urn:x" },
        { refusal: { kind: "rejectedByEngine", detail: "unknown attribute" }, text: "unknown attribute" },
        {
            refusal: { kind: "changesStructure", properties: ["bpmn:SequenceFlow#targetRef"] },
            text: "bpmn:SequenceFlow#targetRef, which follow the pick",
        },
        { refusal: { kind: "namesMissingElement", ids: ["M_1"] }, text: "M_1, which no version has" },
        {
            refusal: { kind: "namesLeftOutElement", ids: ["M_2"] },
            text: "M_2, which the result leaves out",
        },
        { refusal: { kind: "changesOtherDecisions", ids: ["A_1"] }, text: "decisions on A_1" },
        { refusal: { kind: "notHandMergeable" }, text: "no longer picked" },
    ])("says why for $refusal.kind", ({ refusal, text }) => {
        expect(describeHandMergeRefusal(refusal)).toContain(text);
    });
});

describe("handMergeScopeOf", () => {
    it.each([
        ["bpmn:SubProcess", "ownAttributes"],
        ["bpmn:Participant", "ownAttributes"],
        ["bpmn:Process", "ownAttributes"],
        ["bpmn:ServiceTask", "ownContent"],
        ["bpmn:SequenceFlow", "ownContent"],
    ])("merges a %s's %s by hand", (type, scope) => {
        expect(handMergeScopeOf(type)).toBe(scope);
    });
});
