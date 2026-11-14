import { describe, expect, it } from "vitest";

import {
    bpmnElementIdOf,
    singleSelected,
    singleSelectedElementId,
    type BpmnDiagramElement,
} from "./diffSelection";

const task: BpmnDiagramElement = { id: "Task_1", businessObject: { id: "Task_1" } };
const flow: BpmnDiagramElement = { id: "Flow_1", businessObject: { id: "Flow_1" } };
// bpmn-js hands a label its target's business object.
const flowLabel: BpmnDiagramElement & { labelTarget: BpmnDiagramElement } = {
    id: "Flow_1_label",
    businessObject: flow.businessObject,
    labelTarget: flow,
};
const subprocessPlane: BpmnDiagramElement = { id: "Sub_1_plane", businessObject: { id: "Sub_1" } };
// diagram-js's implicit root, set while a diagram is cleared, has no business object.
const implicitRoot: BpmnDiagramElement = { id: "__implicitroot" };
const unnamedProcess: BpmnDiagramElement = { id: "Process_root", businessObject: {} };

describe("bpmnElementIdOf", () => {
    it.each<[string, BpmnDiagramElement, string]>([
        ["an element as its own id", task, "Task_1"],
        ["a label as the element it labels", flowLabel, "Flow_1"],
        ["a plane as its business object", subprocessPlane, "Sub_1"],
        ["an element without a business object as its diagram id", implicitRoot, "__implicitroot"],
        ["a business object without an id as the diagram id", unnamedProcess, "Process_root"],
    ])("names %s", (_case, element, expected) => {
        expect(bpmnElementIdOf(element)).toBe(expected);
    });
});

describe("singleSelected", () => {
    it.each<[string, readonly BpmnDiagramElement[], BpmnDiagramElement | undefined]>([
        ["the one selected element", [flowLabel], flowLabel],
        ["nothing for an empty selection", [], undefined],
        ["nothing for several elements", [task, flow], undefined],
    ])("returns %s", (_case, selection, expected) => {
        expect(singleSelected(selection)).toBe(expected);
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
