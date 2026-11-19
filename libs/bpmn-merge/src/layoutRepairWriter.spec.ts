import { loadBpmnModdle } from "@miragon/bpmn-modeler-diff";
import { describe, expect, it } from "vitest";

import { layoutModelOf } from "./layoutModelReader";
import { writeFlowRepairs } from "./layoutRepairWriter";

const edge = (id: string, y: number) => `
      <bpmndi:BPMNEdge id="${id}" bpmnElement="Flow_1">
        <di:waypoint x="200" y="${y}" />
        <di:waypoint x="300" y="${y}" />
      </bpmndi:BPMNEdge>`;

const TWO_PLANES = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1">
    <bpmn:task id="Task_A" />
    <bpmn:task id="Task_B" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Task_A" targetRef="Task_B" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_First">
    <bpmndi:BPMNPlane id="Plane_First" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Task_A_di" bpmnElement="Task_A">
        <dc:Bounds x="100" y="100" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_B_di" bpmnElement="Task_B">
        <dc:Bounds x="300" y="100" width="100" height="80" />
      </bpmndi:BPMNShape>${edge("Flow_1_first", 140)}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
  <bpmndi:BPMNDiagram id="Diagram_Second">
    <bpmndi:BPMNPlane id="Plane_Second" bpmnElement="Process_1">${edge("Flow_1_second", 150)}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

describe("writeFlowRepairs", () => {
    it("writes a flow drawn on two planes into the drawing the layout reads", async () => {
        const moddle = (await loadBpmnModdle())();
        const { rootElement } = await moddle.fromXML(TWO_PLANES);
        const waypoints = [
            { x: 200, y: 130 },
            { x: 300, y: 130 },
        ];

        writeFlowRepairs(
            rootElement,
            [{ kind: "movedByBuild", flow: "Flow_1", waypoints }],
            (point) => moddle.create("dc:Point", { x: point.x, y: point.y }),
        );

        expect(layoutModelOf(rootElement).edges.get("Flow_1")?.waypoints).toEqual(waypoints);
        const { xml } = await moddle.toXML(rootElement);
        expect(xml).toContain('<di:waypoint x="200" y="150" />');
    });
});
