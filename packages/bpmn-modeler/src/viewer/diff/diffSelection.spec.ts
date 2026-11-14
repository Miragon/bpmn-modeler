import { describe, expect, it } from "vitest";

import { bpmnElementIdOf, singleSelectedElementId, type BpmnDiagramElement } from "./diffSelection";

const task: BpmnDiagramElement = { businessObject: { id: "Task_1" } };
const flow: BpmnDiagramElement = { businessObject: { id: "Flow_1" } };
// bpmn-js hands a label its target's business object.
const flowLabel: BpmnDiagramElement & { labelTarget: BpmnDiagramElement } = {
    businessObject: flow.businessObject,
    labelTarget: flow,
};
const subprocessPlane: BpmnDiagramElement = { businessObject: { id: "Sub_1" } };

describe("bpmnElementIdOf", () => {
    it.each<[string, BpmnDiagramElement, string]>([
        ["an element as its own id", task, "Task_1"],
        ["a label as the element it labels", flowLabel, "Flow_1"],
        ["a plane as its business object", subprocessPlane, "Sub_1"],
    ])("names %s", (_case, element, expected) => {
        expect(bpmnElementIdOf(element)).toBe(expected);
    });
});

describe("singleSelectedElementId", () => {
    it.each<[string, readonly BpmnDiagramElement[], string | undefined]>([
        ["a single element by its BPMN id", [flowLabel], "Flow_1"],
        ["nothing for an empty selection", [], undefined],
        ["nothing for several elements", [task, flow], undefined],
    ])("reports %s", (_case, selection, expected) => {
        expect(singleSelectedElementId(selection)).toBe(expected);
    });
});
