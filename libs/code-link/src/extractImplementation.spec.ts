import { describe, expect, it } from "vitest";

import { BusinessObjectLike, extractImplementation } from "./extractImplementation";

function businessObject(attrs: Record<string, unknown>): BusinessObjectLike {
    return {
        get(name: string) {
            return attrs[name];
        },
        extensionElements: attrs.extensionElements as
            { values?: { $type?: string; type?: string }[] } | undefined,
    };
}

describe("extractImplementation", () => {
    it("reads C7 camunda:class as javaClass", () => {
        const subject = businessObject({ "camunda:class": "com.example.MyDelegate" });

        expect(extractImplementation(subject)).toEqual({
            kind: "javaClass",
            reference: "com.example.MyDelegate",
        });
    });

    it("reads C7 camunda:delegateExpression as delegateExpression", () => {
        const subject = businessObject({ "camunda:delegateExpression": "${myBean}" });

        expect(extractImplementation(subject)).toEqual({
            kind: "delegateExpression",
            reference: "${myBean}",
        });
    });

    it("reads C7 camunda:expression as expression", () => {
        const subject = businessObject({ "camunda:expression": "${svc.run()}" });

        expect(extractImplementation(subject)).toEqual({
            kind: "expression",
            reference: "${svc.run()}",
        });
    });

    it("reads C7 external topic when type is external", () => {
        const subject = businessObject({
            "camunda:type": "external",
            "camunda:topic": "payment-topic",
        });

        expect(extractImplementation(subject)).toEqual({
            kind: "externalTopic",
            reference: "payment-topic",
        });
    });

    it("ignores the topic when the type is not external", () => {
        // A leftover `camunda:topic` without `camunda:type="external"` is not a
        // live external-task binding, so it must not be offered.
        const subject = businessObject({ "camunda:topic": "payment-topic" });

        expect(extractImplementation(subject)).toBeUndefined();
    });

    it("reads C8 zeebe:TaskDefinition.type as jobType", () => {
        const subject = businessObject({
            extensionElements: {
                values: [{ $type: "zeebe:TaskDefinition", type: "payment-service" }],
            },
        });

        expect(extractImplementation(subject)).toEqual({
            kind: "jobType",
            reference: "payment-service",
        });
    });

    it("returns undefined for a business-rule task with only camunda:decisionRef", () => {
        // That DMN link is model-navigation's job — code-link must stay out of
        // the way so the two context-pad entries never collide.
        const subject = businessObject({ "camunda:decisionRef": "Decision_1" });

        expect(extractImplementation(subject)).toBeUndefined();
    });

    it("prefers camunda:class over the other C7 bindings", () => {
        const subject = businessObject({
            "camunda:class": "com.example.Winner",
            "camunda:delegateExpression": "${loser}",
            "camunda:expression": "${alsoLoser}",
        });

        expect(extractImplementation(subject)).toEqual({
            kind: "javaClass",
            reference: "com.example.Winner",
        });
    });

    it("prefers a C7 binding over the C8 task definition", () => {
        const subject = businessObject({
            "camunda:class": "com.example.MyDelegate",
            "extensionElements": {
                values: [{ $type: "zeebe:TaskDefinition", type: "payment-service" }],
            },
        });

        expect(extractImplementation(subject)?.kind).toBe("javaClass");
    });

    it("returns undefined for empty-string bindings", () => {
        expect(extractImplementation(businessObject({ "camunda:class": "" }))).toBeUndefined();
        expect(
            extractImplementation(businessObject({ "camunda:delegateExpression": "" })),
        ).toBeUndefined();
    });

    it("returns undefined when no binding is present", () => {
        expect(extractImplementation(businessObject({}))).toBeUndefined();
    });

    it("returns undefined when extensionElements has no values array", () => {
        const subject: BusinessObjectLike = { get: () => undefined, extensionElements: {} };

        expect(extractImplementation(subject)).toBeUndefined();
    });

    it("returns undefined for a missing business object", () => {
        expect(extractImplementation(undefined)).toBeUndefined();
    });
});
