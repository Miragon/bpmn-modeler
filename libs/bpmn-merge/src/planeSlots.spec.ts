import type { ModdleElement } from "@miragon/bpmn-modeler-diff";
import { describe, expect, it } from "vitest";

import { parseWithoutWarnings } from "./__fixtures__/parseWithoutWarnings";
import { PlaneSlot, PlaneSlots } from "./planeSlots";

const plane = (owner: string) => `
  <bpmndi:BPMNDiagram id="Diagram_${owner}">
    <bpmndi:BPMNPlane id="Plane_${owner}" bpmnElement="${owner}" />
  </bpmndi:BPMNDiagram>`;

async function documentOf(semantic: string, diagrams: readonly string[]): Promise<ModdleElement> {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">${semantic}${diagrams.join("")}
</bpmn:definitions>`;
    return (await parseWithoutWarnings(xml)).rootElement;
}

function slotsOf(current: ModdleElement, incoming: ModdleElement = current): PlaneSlots {
    return PlaneSlots.ofSides({ current, incoming });
}

const documentSlotsOf = (definitions: ModdleElement) => PlaneSlots.ofDocument(definitions);

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
        const version = await documentOf(PROCESSES, [plane("Process_A"), plane("Process_B")]);
        const slots = slotsOf(version);

        expect(slots.slotOf("Process_A")).not.toBe(slots.slotOf("Process_B"));
    });

    it("joins every process plane of one side that the other side's collaboration wraps", async () => {
        const current = await documentOf(PROCESSES, [plane("Process_A"), plane("Process_B")]);
        const incoming = await documentOf(`${COLLABORATION}${PROCESSES}`, [plane("Collab_1")]);
        const slots = slotsOf(current, incoming);

        expect(slots.slotOf("Process_A")).toBe(slots.slotOf("Collab_1"));
        expect(slots.slotOf("Process_B")).toBe(slots.slotOf("Collab_1"));
        expect(slots.slotOf("Process_C")).not.toBe(slots.slotOf("Collab_1"));
        expect(slots.slotOf("Collab_1").isRoot).toBe(true);
    });

    it("keeps a root slot of its own for a process with lanes that no pool names, though the other side draws it on the collaboration's plane", async () => {
        const laneProcess = `
  <bpmn:process id="Process_L">
    <bpmn:laneSet id="LaneSet_L"><bpmn:lane id="Lane_L" /></bpmn:laneSet>
  </bpmn:process>`;
        const semantic = `${COLLABORATION}${PROCESSES}${laneProcess}`;
        const current = await documentOf(semantic, [plane("Collab_1")]);
        const incoming = await documentOf(semantic, [plane("Collab_1"), plane("Process_L")]);
        const slots = slotsOf(current, incoming);

        expect(slots.slotOf("Process_L").equals(new PlaneSlot("root", "Process_L"))).toBe(true);
        expect(slots.slotOf("Process_L")).not.toBe(slots.slotOf("Collab_1"));
    });

    it("keeps a root slot of its own for a process that only a participant without an id names, though the other side draws it on the collaboration's plane", async () => {
        const semantic = `
  <bpmn:collaboration id="Collab_1">
    <bpmn:participant processRef="Process_A" />
    <bpmn:participant id="Pool_B" processRef="Process_B" />
  </bpmn:collaboration>${PROCESSES}`;
        const current = await documentOf(semantic, [plane("Collab_1")]);
        const incoming = await documentOf(semantic, [plane("Collab_1"), plane("Process_A")]);
        const slots = slotsOf(current, incoming);

        expect(slots.slotOf("Process_A").equals(new PlaneSlot("root", "Process_A"))).toBe(true);
        expect(slots.slotOf("Process_B")).toBe(slots.slotOf("Collab_1"));
    });

    it("gives a sub-process's plane a slot of its own that is no root slot", async () => {
        const version = await documentOf(PROCESSES, [plane("Process_A"), plane("Sub_A")]);
        const slots = slotsOf(version);

        expect(slots.slotOf("Sub_A")).not.toBe(slots.slotOf("Process_A"));
        expect(slots.slotOf("Sub_A").isRoot).toBe(false);
    });

    it("reads one document's slots as the document merged with itself", async () => {
        const version = await documentOf(`${COLLABORATION}${PROCESSES}`, [
            plane("Collab_1"),
            plane("Process_C"),
        ]);
        const slots = documentSlotsOf(version);

        expect(slots.slotOf("Process_A")).toBe(slots.slotOf("Collab_1"));
        expect(slots.slotOf("Process_C")).not.toBe(slots.slotOf("Collab_1"));
    });

    it("names a joined root slot after the collaboration that wraps its processes", async () => {
        const current = await documentOf(PROCESSES, [plane("Process_A"), plane("Sub_A")]);
        const incoming = await documentOf(`${COLLABORATION}${PROCESSES}`, [plane("Collab_1")]);
        const slots = slotsOf(current, incoming);

        expect(slots.slotOf("Process_A").equals(new PlaneSlot("root", "Collab_1"))).toBe(true);
        expect(slots.slotOf("Sub_A").equals(new PlaneSlot("subProcess", "Sub_A"))).toBe(true);
    });

    it.each<[string, string, boolean]>([
        ["the collaboration's own plane", "Collab_1", true],
        ["a process plane the collaboration wraps", "Process_B", true],
        ["a process plane the collaboration does not wrap", "Process_C", false],
        ["a sub-process plane inside a wrapped process", "Sub_A", false],
    ])("tells whether the joined root slot holds %s (%s)", async (_case, planeOwner, holds) => {
        const current = await documentOf(PROCESSES, [plane("Process_A"), plane("Sub_A")]);
        const incoming = await documentOf(`${COLLABORATION}${PROCESSES}`, [plane("Collab_1")]);
        const slots = slotsOf(current, incoming);

        expect(slots.holds(slots.slotOf("Process_A"), planeOwner)).toBe(holds);
    });

    it("hands out one instance per place only within itself; slots of two are compared by value", async () => {
        const version = await documentOf(PROCESSES, [plane("Process_A")]);
        const first = documentSlotsOf(version);
        const second = documentSlotsOf(version);

        expect(first.slotOf("Process_A")).not.toBe(second.slotOf("Process_A"));
        expect(first.slotOf("Process_A").equals(second.slotOf("Process_A"))).toBe(true);
        expect(first.slotOf("Process_A").key).toBe(second.slotOf("Process_A").key);
    });
});

describe("PlaneSlot", () => {
    it.each<[string, PlaneSlot, PlaneSlot, boolean]>([
        [
            "two root slots of one owner",
            new PlaneSlot("root", "P"),
            new PlaneSlot("root", "P"),
            true,
        ],
        ["root slots of two owners", new PlaneSlot("root", "P"), new PlaneSlot("root", "Q"), false],
        [
            "a root and a sub-process slot of one owner",
            new PlaneSlot("root", "P"),
            new PlaneSlot("subProcess", "P"),
            false,
        ],
    ])("compares %s by value, spelled as one key", (_case, left, right, equal) => {
        expect(left.equals(right)).toBe(equal);
        expect(left.key === right.key).toBe(equal);
    });
});
