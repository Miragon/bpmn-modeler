import { describe, expect, it } from "vitest";

import { parseWithoutWarnings } from "./__fixtures__/parseWithoutWarnings";
import { contentsPlaneIn, diagramIndexOf, shapeDrawingOf } from "./diagramIndex";

const bounds = `<dc:Bounds x="0" y="0" width="100" height="80" />`;

const document = (rootDrawings: string) => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1">
    <bpmn:task id="Task_A" />
    <bpmn:task id="Task_B" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Task_A" targetRef="Task_B" />
    <bpmn:subProcess id="Sub_1">
      <bpmn:task id="Task_In" />
    </bpmn:subProcess>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_Process">
    <bpmndi:BPMNPlane id="Plane_Process" bpmnElement="Process_1">${rootDrawings}
      <bpmndi:BPMNShape id="Task_B_di" bpmnElement="Task_B">${bounds}</bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1"><di:waypoint x="100" y="40" /><di:waypoint x="200" y="40" /></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
  <bpmndi:BPMNDiagram id="Diagram_Sub">
    <bpmndi:BPMNPlane id="Plane_Sub" bpmnElement="Sub_1">
      <bpmndi:BPMNShape id="Task_In_di" bpmnElement="Task_In">${bounds}</bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

const COLLAPSED_WITHOUT_BOUNDS = `
      <bpmndi:BPMNShape id="Sub_1_unbounded" bpmnElement="Sub_1" />`;
const EXPANDED = `
      <bpmndi:BPMNShape id="Sub_1_expanded" bpmnElement="Sub_1" isExpanded="true">${bounds}</bpmndi:BPMNShape>`;
const COLLAPSED = `
      <bpmndi:BPMNShape id="Sub_1_collapsed" bpmnElement="Sub_1">${bounds}</bpmndi:BPMNShape>`;

async function indexOf(rootDrawings: string) {
    return diagramIndexOf((await parseWithoutWarnings(document(rootDrawings))).rootElement);
}

describe("shapeDrawingOf", () => {
    it.each([
        ["the first drawing with bounds", COLLAPSED_WITHOUT_BOUNDS + EXPANDED, "Sub_1_expanded"],
        ["the first of two drawings with bounds", COLLAPSED + EXPANDED, "Sub_1_collapsed"],
        ["none when no drawing has bounds", COLLAPSED_WITHOUT_BOUNDS, undefined],
    ])("answers %s", async (_case, rootDrawings, drawingId) => {
        const index = await indexOf(rootDrawings);

        expect(shapeDrawingOf(index, "Sub_1")?.element.id).toBe(drawingId);
    });

    it("answers none for an element drawn by an edge", async () => {
        const index = await indexOf(EXPANDED);

        expect(shapeDrawingOf(index, "Flow_1")).toBeUndefined();
    });

    it("answers none for an element the index does not draw", async () => {
        const index = await indexOf(EXPANDED);

        expect(shapeDrawingOf(index, "Task_A")).toBeUndefined();
    });
});

describe("contentsPlaneIn", () => {
    it.each([
        ["its own plane under a collapsed shape", COLLAPSED, "Sub_1"],
        ["the plane its expanded shape lies on", EXPANDED, "Process_1"],
        [
            "the plane of the shape the layout reads, past a first drawing without bounds",
            COLLAPSED_WITHOUT_BOUNDS + EXPANDED,
            "Process_1",
        ],
        ["its own plane when no shape has bounds", COLLAPSED_WITHOUT_BOUNDS, "Sub_1"],
    ])("puts a sub-process's contents on %s", async (_case, rootDrawings, planeOwner) => {
        const index = await indexOf(rootDrawings);

        expect(contentsPlaneIn(index, "Sub_1")).toBe(planeOwner);
    });
});
