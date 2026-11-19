import { describe, expect, it } from "vitest";

import { parseWithoutWarnings } from "./__fixtures__/parseWithoutWarnings";
import { type DiagramIndex, diagramIndexOf, rootPlaneProcessesOf } from "./diagramIndex";

const plane = (owner: string) => `
  <bpmndi:BPMNDiagram id="Diagram_${owner || "None"}">
    <bpmndi:BPMNPlane id="Plane_${owner || "None"}"${owner === "" ? "" : ` bpmnElement="${owner}"`} />
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

describe("rootPlaneProcessesOf", () => {
    it("reads a process's plane as drawing that process alone", async () => {
        const index = await indexOf(PROCESSES, [plane("Process_A"), plane("Process_B")]);

        expect(rootPlaneProcessesOf(index, "Process_A")).toEqual(["Process_A"]);
        expect(rootPlaneProcessesOf(index, "Process_B")).toEqual(["Process_B"]);
    });

    it("reads a collaboration's plane as drawing the processes its participants name", async () => {
        const collaboration = `
  <bpmn:collaboration id="Collab_1">
    <bpmn:participant id="Pool_A" processRef="Process_A" />
    <bpmn:participant id="Pool_B" processRef="Process_B" />
    <bpmn:participant id="Pool_Black_Box" />
  </bpmn:collaboration>`;
        const index = await indexOf(`${collaboration}${PROCESSES}`, [
            plane("Collab_1"),
            plane("Process_C"),
        ]);

        expect(rootPlaneProcessesOf(index, "Collab_1")).toEqual(["Process_A", "Process_B"]);
        expect(rootPlaneProcessesOf(index, "Process_C")).toEqual(["Process_C"]);
    });

    it("reads no process on a sub-process's plane, a plane that names nothing or one the document lacks", async () => {
        const index = await indexOf(PROCESSES, [plane("Process_A"), plane("Sub_A"), plane("")]);

        expect(rootPlaneProcessesOf(index, "Sub_A")).toEqual([]);
        expect(rootPlaneProcessesOf(index, "")).toEqual([]);
        expect(rootPlaneProcessesOf(index, "Process_B")).toEqual([]);
    });
});
