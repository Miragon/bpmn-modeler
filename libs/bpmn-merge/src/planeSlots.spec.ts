import { describe, expect, it } from "vitest";

import { parseWithoutWarnings } from "./__fixtures__/parseWithoutWarnings";
import { type DiagramIndex, diagramIndexOf } from "./diagramIndex";
import { PlaneSlots } from "./planeSlots";

const plane = (owner: string) => `
  <bpmndi:BPMNDiagram id="Diagram_${owner}">
    <bpmndi:BPMNPlane id="Plane_${owner}" bpmnElement="${owner}" />
  </bpmndi:BPMNDiagram>`;

async function indexOf(semantic: string, diagrams: readonly string[]): Promise<DiagramIndex> {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">${semantic}${diagrams.join("")}
</bpmn:definitions>`;
    return diagramIndexOf((await parseWithoutWarnings(xml)).rootElement);
}

const PROCESSES = `
  <bpmn:process id="Process_A"><bpmn:subProcess id="Sub_A" /></bpmn:process>
  <bpmn:process id="Process_B" />
  <bpmn:process id="Process_C" />`;

const COLLABORATION = `
  <bpmn:collaboration id="Collab_1">
    <bpmn:participant id="Pool_A" processRef="Process_A" />
    <bpmn:participant id="Pool_B" processRef="Process_B" />
  </bpmn:collaboration>`;

describe("PlaneSlots", () => {
    it("gives the root planes of two unrelated processes two slots", async () => {
        const index = await indexOf(PROCESSES, [plane("Process_A"), plane("Process_B")]);
        const slots = new PlaneSlots({ current: index, incoming: index });

        expect(slots.slotOf("Process_A")).not.toBe(slots.slotOf("Process_B"));
    });

    it("joins every process plane of one side that the other side's collaboration wraps", async () => {
        const current = await indexOf(PROCESSES, [plane("Process_A"), plane("Process_B")]);
        const incoming = await indexOf(`${COLLABORATION}${PROCESSES}`, [plane("Collab_1")]);
        const slots = new PlaneSlots({ current, incoming });

        expect(slots.slotOf("Process_A")).toBe(slots.slotOf("Collab_1"));
        expect(slots.slotOf("Process_B")).toBe(slots.slotOf("Collab_1"));
        expect(slots.slotOf("Process_C")).not.toBe(slots.slotOf("Collab_1"));
        expect(slots.isRoot(slots.slotOf("Collab_1"))).toBe(true);
    });

    it("gives a sub-process's plane a slot of its own that is no root slot", async () => {
        const index = await indexOf(PROCESSES, [plane("Process_A"), plane("Sub_A")]);
        const slots = new PlaneSlots({ current: index, incoming: index });

        expect(slots.slotOf("Sub_A")).not.toBe(slots.slotOf("Process_A"));
        expect(slots.isRoot(slots.slotOf("Sub_A"))).toBe(false);
    });

    it("reads one document's slots as the document merged with itself", async () => {
        const index = await indexOf(`${COLLABORATION}${PROCESSES}`, [
            plane("Collab_1"),
            plane("Process_C"),
        ]);
        const slots = PlaneSlots.ofDocument(index);

        expect(slots.slotOf("Process_A")).toBe(slots.slotOf("Collab_1"));
        expect(slots.slotOf("Process_C")).not.toBe(slots.slotOf("Collab_1"));
    });
});
