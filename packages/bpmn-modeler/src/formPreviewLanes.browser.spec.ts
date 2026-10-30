import { afterEach, expect, it, vi } from "vitest";
import type { FormPreviewRequest } from "@miragon/bpmn-model-navigation";
import { createModeler } from "./createModeler";
import type { BpmnModeler } from "./modeler";
import { afterPaint, mountWithPanel, removeMounts } from "./__fixtures__/surfaceMount";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:zeebe="http://camunda.org/schema/zeebe/1.0" id="Definitions_Lanes" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collaboration"><bpmn:participant id="Pool" processRef="Process" /></bpmn:collaboration>
  <bpmn:process id="Process" isExecutable="false">
    <bpmn:laneSet id="Lanes">
      <bpmn:lane id="Lane_Selected"><bpmn:flowNodeRef>Task_Linked</bpmn:flowNodeRef><bpmn:flowNodeRef>Task_Next</bpmn:flowNodeRef></bpmn:lane>
      <bpmn:lane id="Lane_Other" />
    </bpmn:laneSet>
    <bpmn:userTask id="Task_Linked"><bpmn:extensionElements><zeebe:formDefinition formId="Form" /></bpmn:extensionElements></bpmn:userTask>
    <bpmn:userTask id="Task_Next" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram"><bpmndi:BPMNPlane id="Plane" bpmnElement="Collaboration">
    <bpmndi:BPMNShape id="Pool_di" bpmnElement="Pool" isHorizontal="true"><dc:Bounds x="50" y="50" width="700" height="400" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Lane_Selected_di" bpmnElement="Lane_Selected" isHorizontal="true"><dc:Bounds x="80" y="50" width="670" height="250" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Lane_Other_di" bpmnElement="Lane_Other" isHorizontal="true"><dc:Bounds x="80" y="300" width="670" height="150" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Linked_di" bpmnElement="Task_Linked"><dc:Bounds x="150" y="100" width="100" height="80" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Next_di" bpmnElement="Task_Next"><dc:Bounds x="350" y="100" width="100" height="80" /></bpmndi:BPMNShape>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;

let modeler: BpmnModeler | undefined;
afterEach(async () => {
    await afterPaint();
    modeler?.destroy();
    removeMounts();
});

it("excludes the enclosing imported lane even though its task is a sibling under the pool", async () => {
    const { container, panel } = mountWithPanel();
    const open = vi.fn((_request: FormPreviewRequest) => ({ close: vi.fn(), reposition: vi.fn() }));
    modeler = await createModeler(container, {
        engine: "c8",
        propertiesPanel: { parent: panel },
        linting: false,
        capabilities: { modelNavigation: { openReference: vi.fn(), formPreview: { open } } },
    });
    await modeler.loadDiagram(XML);
    const registry = modeler.getService("elementRegistry");
    const target = registry.get("Task_Linked") as unknown as { parent: unknown };
    const lane = registry.get("Lane_Selected") as unknown as { parent: unknown };
    expect(target.parent).toBe(lane.parent);
    expect(target.parent).not.toBe(lane);
    modeler.getService<{ select(elements: unknown[]): void }>("selection").select([target]);
    expect(open).toHaveBeenCalledOnce();
    const anchor = open.mock.calls[0][0].anchor();
    const canvas = modeler.getService<{
        getAbsoluteBBox(element: unknown): { x: number; y: number; width: number; height: number };
    }>("canvas");
    const viewport = (id: string) => {
        const rect = canvas.getAbsoluteBBox(registry.get(id));
        return { ...rect, x: rect.x + anchor.canvas.x, y: rect.y + anchor.canvas.y };
    };
    expect(anchor.obstacles).not.toContainEqual(viewport("Lane_Selected"));
    expect(anchor.obstacles).not.toContainEqual(viewport("Pool"));
    expect(anchor.obstacles).toContainEqual(viewport("Task_Next"));
    expect(anchor.obstacles).toContainEqual(viewport("Lane_Other"));
});
