import { describe, expect, it } from "vitest";

import { BusinessObjectLike, extractReference } from "./extractReference";

function businessObject(attrs: Record<string, unknown>): BusinessObjectLike {
    return {
        get(name: string) {
            return attrs[name];
        },
        extensionElements: attrs.extensionElements as
            | { values?: { $type?: string; processId?: string; decisionId?: string }[] }
            | undefined,
    };
}

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
