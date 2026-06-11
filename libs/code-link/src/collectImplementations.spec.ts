import { describe, expect, it, vi } from "vitest";

// `is()` is mocked to compare against each element's own `type`, so a single
// registry can hold elements of mixed BPMN types.
vi.mock("bpmn-js/lib/util/ModelUtil", () => ({
    is: (element: { type?: string } | undefined, type: string) => element?.type === type,
}));

import { collectImplementations, ElementRegistryLike } from "./collectImplementations";

interface FakeElement {
    id?: string;
    type?: string;
    businessObject?: { get(name: string): unknown; extensionElements?: { values?: unknown[] } };
}

function registry(elements: FakeElement[]): ElementRegistryLike {
    return { getAll: () => elements as never };
}

function bo(attrs: Record<string, unknown>): FakeElement["businessObject"] {
    return {
        get: (name) => attrs[name],
        extensionElements: attrs.extensionElements as { values?: unknown[] } | undefined,
    };
}

describe("collectImplementations", () => {
    it("collects one entry per implementable task with a resolvable binding", () => {
        const entries = collectImplementations(
            registry([
                {
                    id: "Activity_Charge",
                    type: "bpmn:ServiceTask",
                    businessObject: bo({ "camunda:class": "com.example.Charge" }),
                },
                {
                    id: "Activity_Mail",
                    type: "bpmn:SendTask",
                    businessObject: bo({ "camunda:delegateExpression": "${mailer}" }),
                },
            ]),
        );

        expect(entries).toEqual([
            { activityId: "Activity_Charge", kind: "javaClass", reference: "com.example.Charge" },
            { activityId: "Activity_Mail", kind: "delegateExpression", reference: "${mailer}" },
        ]);
    });

    it("skips non-implementable element types even when they carry attributes", () => {
        const entries = collectImplementations(
            registry([
                {
                    id: "Task_User",
                    type: "bpmn:UserTask",
                    businessObject: bo({ "camunda:class": "com.example.X" }),
                },
                {
                    id: "Flow_1",
                    type: "bpmn:SequenceFlow",
                    businessObject: bo({}),
                },
            ]),
        );

        expect(entries).toEqual([]);
    });

    it("skips implementable tasks without a binding", () => {
        const entries = collectImplementations(
            registry([{ id: "Activity_Empty", type: "bpmn:ServiceTask", businessObject: bo({}) }]),
        );

        expect(entries).toEqual([]);
    });

    it("skips elements without an id (the status map is keyed by activity id)", () => {
        const entries = collectImplementations(
            registry([
                {
                    type: "bpmn:ServiceTask",
                    businessObject: bo({ "camunda:class": "com.example.NoId" }),
                },
            ]),
        );

        expect(entries).toEqual([]);
    });

    it("reads a C8 zeebe:taskDefinition job type", () => {
        const entries = collectImplementations(
            registry([
                {
                    id: "Activity_Pay",
                    type: "bpmn:ServiceTask",
                    businessObject: bo({
                        extensionElements: {
                            values: [{ $type: "zeebe:TaskDefinition", type: "payment-service" }],
                        },
                    }),
                },
            ]),
        );

        expect(entries).toEqual([
            { activityId: "Activity_Pay", kind: "jobType", reference: "payment-service" },
        ]);
    });

    it("sorts entries by activity id so the list is order-stable across calls", () => {
        const entries = collectImplementations(
            registry([
                {
                    id: "Activity_Z",
                    type: "bpmn:ServiceTask",
                    businessObject: bo({ "camunda:class": "com.example.Z" }),
                },
                {
                    id: "Activity_A",
                    type: "bpmn:ServiceTask",
                    businessObject: bo({ "camunda:class": "com.example.A" }),
                },
            ]),
        );

        expect(entries.map((entry) => entry.activityId)).toEqual(["Activity_A", "Activity_Z"]);
    });
});
