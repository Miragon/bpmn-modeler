import { afterEach, describe, expect, it, vi } from "vitest";

import { parseWithoutWarnings } from "./__fixtures__/parseWithoutWarnings";
import { DiagramIndex } from "./diagramIndex";
import { SideReadings } from "./sideReadings";

async function readingsOf(currentXml: string, incomingXml: string): Promise<SideReadings> {
    return SideReadings.of({
        current: await parseWithoutWarnings(currentXml),
        incoming: await parseWithoutWarnings(incomingXml),
    });
}

describe("SideReadings", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("indexes each side's diagrams once", async () => {
        const current = await parseWithoutWarnings(TWO_PROCESS_DIAGRAMS);
        const incoming = await parseWithoutWarnings(ONE_COLLABORATION);
        const indexOf = vi.spyOn(DiagramIndex, "of");

        SideReadings.of({ current, incoming });

        expect(indexOf).toHaveBeenCalledTimes(2);
        expect(indexOf.mock.calls[0]?.[0]).toBe(current.rootElement);
        expect(indexOf.mock.calls[1]?.[0]).toBe(incoming.rootElement);
    });

    it("reads each side's diagrams into its own index", async () => {
        const readings = await readingsOf(TWO_PROCESS_DIAGRAMS, ONE_COLLABORATION);

        expect(readings.indexes.current.draws("Pool_A")).toBe(false);
        expect(readings.indexes.incoming.draws("Pool_A")).toBe(true);
    });

    it("gives a process one side draws alone the slot of the pool the other wraps it in", async () => {
        const readings = await readingsOf(TWO_PROCESS_DIAGRAMS, ONE_COLLABORATION);

        expect(readings.slots.slotOf("Process_A")).toBe(readings.slots.slotOf("Collab_1"));
    });

    it("reads each side's layout, in side order, before its tree is taken apart", async () => {
        const readings = await readingsOf(TWO_PROCESS_DIAGRAMS, ONE_COLLABORATION);

        const [currentLayout, incomingLayout] = readings.layouts;
        expect(currentLayout?.shapes.has("Pool_A")).toBe(false);
        expect(incomingLayout?.shapes.has("Pool_A")).toBe(true);
        for (const layout of [currentLayout, incomingLayout]) {
            expect(layout?.shapes.get("Task_A")?.slot).toBe(readings.slots.slotOf("Collab_1"));
        }
    });

    it("takes each side's tree apart last, in current's definitions for the result", async () => {
        const readings = await readingsOf(TWO_PROCESS_DIAGRAMS, ONE_COLLABORATION);

        expect([...readings.trees.current.units.keys()]).toEqual([
            "Process_A",
            "Task_A",
            "Process_B",
            "Task_B",
        ]);
        expect(readings.trees.incoming.units.has("Collab_1")).toBe(true);
        expect(readings.trees.current.definitions).toBe(readings.currentDefinitions);
        expect(readings.currentDefinitions.rootElements).toEqual([]);
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
