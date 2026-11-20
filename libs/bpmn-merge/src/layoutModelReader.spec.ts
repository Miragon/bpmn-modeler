import { describe, expect, it } from "vitest";

import { baseModel, nodeById } from "./__fixtures__/baseModel";
import { type BpmnFixtureModel, renderBpmn } from "./__fixtures__/bpmnModelBuilder";
import { parseWithoutWarnings } from "./__fixtures__/parseWithoutWarnings";
import { rootPlane, subProcessPlane } from "./__fixtures__/shapePlane";
import { diagramIndexOf } from "./diagramIndex";
import { layoutModelOf } from "./layoutModelReader";
import { PlaneSlots } from "./planeSlots";

async function layoutOf(edit: (model: BpmnFixtureModel) => void) {
    const model = baseModel("c8");
    edit(model);
    return layoutModelOf((await parseWithoutWarnings(renderBpmn(model))).rootElement);
}

function collapseShipping(model: BpmnFixtureModel): void {
    Object.assign(nodeById(model, "Sub_Ship"), { collapsed: true, width: 100, height: 80 });
}

describe("layoutModelOf", () => {
    it.each([
        { label: "a collaboration's plane", edit: () => {}, plane: "Collaboration_1" },
        {
            label: "a process's plane",
            edit: (model: BpmnFixtureModel) => {
                model.pools = [];
                model.flows = model.flows.filter((flow) => flow.kind !== "message");
            },
            plane: "Process_1",
        },
        {
            label: "the plane a collapsed sub-process lies on",
            edit: collapseShipping,
            plane: "Collaboration_1",
        },
    ])("reads $label as a root plane", async ({ edit, plane }) => {
        const layout = await layoutOf(edit);

        expect(layout.shapes.get("Sub_Ship")).toMatchObject(rootPlane(plane));
    });

    it("reads a collapsed sub-process's own plane as a sub-process plane", async () => {
        const layout = await layoutOf(collapseShipping);

        expect(layout.shapes.get("Task_Pack")).toMatchObject(subProcessPlane("Sub_Ship"));
    });

    it("reads each shape's plane into the slot the merge gives it", async () => {
        const current = await parseWithoutWarnings(TWO_PROCESS_DIAGRAMS);
        const incoming = await parseWithoutWarnings(ONE_COLLABORATION);
        const slots = new PlaneSlots({
            current: diagramIndexOf(current.rootElement),
            incoming: diagramIndexOf(incoming.rootElement),
        });

        const currentLayout = layoutModelOf(current.rootElement, slots);
        const incomingLayout = layoutModelOf(incoming.rootElement, slots);

        expect(currentLayout.shapes.get("Task_A")).toMatchObject({ plane: "Process_A" });
        expect(currentLayout.shapes.get("Task_B")).toMatchObject({ plane: "Process_B" });
        for (const layout of [currentLayout, incomingLayout]) {
            expect(layout.shapes.get("Task_A")?.slot).toBe(slots.slotOf("Collab_1"));
            expect(layout.shapes.get("Task_B")?.slot).toBe(slots.slotOf("Collab_1"));
        }
    });

    it("reads one document's planes into the slots of the document merged with itself", async () => {
        const current = await parseWithoutWarnings(TWO_PROCESS_DIAGRAMS);

        const layout = layoutModelOf(current.rootElement);

        expect(layout.shapes.get("Task_B")!.slot.equals(layout.shapes.get("Task_A")!.slot)).toBe(
            false,
        );
    });
});

const DEFINITIONS = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">`;

const PROCESSES = `
  <bpmn:process id="Process_A"><bpmn:task id="Task_A" /></bpmn:process>
  <bpmn:process id="Process_B"><bpmn:task id="Task_B" /></bpmn:process>`;

const taskShape = (task: string) => `
      <bpmndi:BPMNShape id="${task}_di" bpmnElement="${task}">
        <dc:Bounds x="200" y="100" width="100" height="80" />
      </bpmndi:BPMNShape>`;

const TWO_PROCESS_DIAGRAMS = `${DEFINITIONS}${PROCESSES}
  <bpmndi:BPMNDiagram id="Diagram_A">
    <bpmndi:BPMNPlane id="Plane_A" bpmnElement="Process_A">${taskShape("Task_A")}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
  <bpmndi:BPMNDiagram id="Diagram_B">
    <bpmndi:BPMNPlane id="Plane_B" bpmnElement="Process_B">${taskShape("Task_B")}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

const ONE_COLLABORATION = `${DEFINITIONS}
  <bpmn:collaboration id="Collab_1">
    <bpmn:participant id="Pool_A" processRef="Process_A" />
    <bpmn:participant id="Pool_B" processRef="Process_B" />
  </bpmn:collaboration>${PROCESSES}
  <bpmndi:BPMNDiagram id="Diagram_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Collab_1">
      <bpmndi:BPMNShape id="Pool_A_di" bpmnElement="Pool_A" isHorizontal="true">
        <dc:Bounds x="100" y="50" width="600" height="200" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Pool_B_di" bpmnElement="Pool_B" isHorizontal="true">
        <dc:Bounds x="100" y="300" width="600" height="200" />
      </bpmndi:BPMNShape>${taskShape("Task_A")}${taskShape("Task_B")}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
