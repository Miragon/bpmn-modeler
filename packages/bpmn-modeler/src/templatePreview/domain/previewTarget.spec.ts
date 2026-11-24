import { describe, expect, it } from "vitest";

import { previewTargetOf } from "./previewTarget";

describe("previewTargetOf", () => {
    it.each([
        ["a task", { appliesTo: ["bpmn:ServiceTask"] }],
        ["an event", { appliesTo: ["bpmn:IntermediateThrowEvent"] }],
        [
            "the element type over appliesTo",
            { appliesTo: ["bpmn:Process"], elementType: { value: "bpmn:ServiceTask" } },
        ],
        ["a template without types", {}],
        ["malformed types", { appliesTo: "bpmn:Process", elementType: "x" }],
    ])("places %s as a shape", (_, template) => {
        expect(previewTargetOf(template)).toEqual({ kind: "shape" });
    });

    it.each([
        ["a process", { appliesTo: ["bpmn:Process"] }, "bpmn:Process"],
        ["a sequence flow", { appliesTo: ["bpmn:SequenceFlow"] }, "bpmn:SequenceFlow"],
        ["the first applicable type", { appliesTo: ["bpmn:Process", "bpmn:Task"] }, "bpmn:Process"],
    ])("cannot place %s", (_, template, type) => {
        expect(previewTargetOf(template)).toEqual({ kind: "unsupported", type });
    });
});
