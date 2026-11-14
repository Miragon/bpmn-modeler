import { describe, expect, it } from "vitest";

import type { ReferenceKind } from "@miragon/bpmn-modeler-types";

import {
    BusinessObjectLike,
    extractModelReference,
    extractReference,
    referenceKindOf,
} from "./extractReference";

function businessObject(attrs: Record<string, unknown>): BusinessObjectLike {
    return {
        get(name: string) {
            return attrs[name];
        },
        extensionElements: attrs.extensionElements as
            | {
                  values?: {
                      $type?: string;
                      processId?: string;
                      decisionId?: string;
                      formId?: string;
                  }[];
              }
            | undefined,
    };
}

function elementOfType(...types: string[]) {
    return { businessObject: { $instanceOf: (type: string) => types.includes(type) } };
}

describe("referenceKindOf", () => {
    it.each([
        ["bpmn:CallActivity", "process"],
        ["bpmn:BusinessRuleTask", "decision"],
        ["bpmn:UserTask", "form"],
    ])("maps a %s to a %s reference", (type, kind) => {
        expect(referenceKindOf(elementOfType("bpmn:Task", type))).toBe(kind);
    });

    it("maps an element that holds no reference to no kind", () => {
        expect(referenceKindOf(elementOfType("bpmn:Task", "bpmn:ServiceTask"))).toBe(undefined);
    });

    function startEvent(parentType?: string, eventDefinitions?: unknown[]) {
        return {
            businessObject: {
                $instanceOf: (type: string) => ["bpmn:Event", "bpmn:StartEvent"].includes(type),
                eventDefinitions,
                $parent: parentType && { $instanceOf: (type: string) => type === parentType },
            },
        };
    }

    it.each([
        ["a none start event of a process", "form", startEvent("bpmn:Process")],
        [
            "a none start event with an empty definition list",
            "form",
            startEvent("bpmn:Process", []),
        ],
        [
            "a message start event of a process",
            undefined,
            startEvent("bpmn:Process", [{ $type: "bpmn:MessageEventDefinition" }]),
        ],
        ["a none start event inside a subprocess", undefined, startEvent("bpmn:SubProcess")],
        ["a none start event without a parent", undefined, startEvent()],
        [
            "the external label of a none start event of a process",
            undefined,
            { ...startEvent("bpmn:Process"), type: "label" },
        ],
    ])("maps %s to %s", (_label, kind, element) => {
        expect(referenceKindOf(element)).toBe(kind);
    });
});

describe("extractReference", () => {
    it("reads C7 calledElement on Call Activity", () => {
        const subject = businessObject({ calledElement: "ProcessB" });

        expect(extractReference(subject, "process")).toBe("ProcessB");
    });

    it("reads C8 zeebe:CalledElement.processId on Call Activity", () => {
        const subject = businessObject({
            extensionElements: {
                values: [{ $type: "zeebe:CalledElement", processId: "ProcessB" }],
            },
        });

        expect(extractReference(subject, "process")).toBe("ProcessB");
    });

    it("reads C7 camunda:decisionRef on Business Rule Task", () => {
        const subject = businessObject({ "camunda:decisionRef": "Decision_1" });

        expect(extractReference(subject, "decision")).toBe("Decision_1");
    });

    it("reads C8 zeebe:CalledDecision.decisionId on Business Rule Task", () => {
        const subject = businessObject({
            extensionElements: {
                values: [{ $type: "zeebe:CalledDecision", decisionId: "Decision_1" }],
            },
        });

        expect(extractReference(subject, "decision")).toBe("Decision_1");
    });

    it("reads C8 zeebe:FormDefinition.formId on User Task", () => {
        const subject = businessObject({
            extensionElements: {
                values: [{ $type: "zeebe:FormDefinition", formId: "Form_Request" }],
            },
        });

        expect(extractReference(subject, "form")).toBe("Form_Request");
    });

    it("ignores custom and embedded form references", () => {
        const subject = businessObject({
            extensionElements: {
                values: [
                    { $type: "zeebe:FormDefinition", formId: "" },
                    { $type: "zeebe:UserTaskForm", formId: "Form_Embedded" },
                ],
            },
        });

        expect(extractReference(subject, "form")).toBeUndefined();
    });

    it("prefers the C7 attribute when both shapes are present", () => {
        const subject = businessObject({
            calledElement: "FromC7",
            extensionElements: {
                values: [{ $type: "zeebe:CalledElement", processId: "FromC8" }],
            },
        });

        expect(extractReference(subject, "process")).toBe("FromC7");
    });

    it("returns undefined when the reference is unset", () => {
        const subject = businessObject({});

        expect(extractReference(subject, "process")).toBeUndefined();
        expect(extractReference(subject, "decision")).toBeUndefined();
        expect(extractReference(subject, "form")).toBeUndefined();
    });

    it("returns undefined for empty-string reference", () => {
        const subject = businessObject({ calledElement: "" });

        expect(extractReference(subject, "process")).toBeUndefined();
    });

    it("returns undefined when extensionElements is absent on the C8 path", () => {
        // Newly placed Call Activities have no extensionElements property at
        // all — distinct from "has extensionElements but no matching child".
        const subject: BusinessObjectLike = {
            get: () => undefined,
        };

        expect(extractReference(subject, "process")).toBeUndefined();
        expect(extractReference(subject, "decision")).toBeUndefined();
    });

    it("returns undefined when extensionElements exists but has no values array", () => {
        // moddle sometimes hands back the wrapper object without populating
        // `values` — typically right after the element is created and before
        // any extension child is added.  Treat the same as "no extensions".
        const subject: BusinessObjectLike = {
            get: () => undefined,
            extensionElements: {},
        };

        expect(extractReference(subject, "process")).toBeUndefined();
        expect(extractReference(subject, "decision")).toBeUndefined();
    });

    it("returns undefined for missing business object", () => {
        expect(extractReference(undefined, "process")).toBeUndefined();
    });
});

describe("extractModelReference", () => {
    const definitions = { $attrs: { "xmlns:child": "urn:example:child" } };
    const elementReferencing = (attrs: Record<string, unknown>): BusinessObjectLike => ({
        ...businessObject(attrs),
        $parent: definitions,
    });

    it.each<{ kind: ReferenceKind; attrs: Record<string, unknown>; expected: object }>([
        {
            kind: "process",
            attrs: { calledElement: "child:Process_Target" },
            expected: { id: "Process_Target", namespace: "urn:example:child", kind: "process" },
        },
        {
            kind: "decision",
            attrs: { "camunda:decisionRef": "child:Decision_1" },
            expected: { id: "child:Decision_1", kind: "decision" },
        },
        {
            kind: "form",
            attrs: {
                extensionElements: {
                    values: [{ $type: "zeebe:FormDefinition", formId: "child:Form_1" }],
                },
            },
            expected: { id: "child:Form_1", kind: "form" },
        },
    ])(
        "resolves a prefix only where the $kind reference is a QName",
        ({ kind, attrs, expected }) => {
            expect(extractModelReference(elementReferencing(attrs), kind)).toEqual(expected);
        },
    );
});
