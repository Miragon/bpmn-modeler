import { elementSnapshots } from "@miragon/bpmn-modeler-diff";
import { describe, expect, it } from "vitest";

import { isMergeElement } from "./mergeElements";
import { VersionSnapshots } from "./versionSnapshots";

const SEMANTIC = `
  <bpmn:collaboration id="Collab_1">
    <bpmn:participant id="Pool_A" processRef="Process_A" />
    <bpmn:participant processRef="Process_B" />
  </bpmn:collaboration>
  <bpmn:process id="Process_A"><bpmn:task id="Task_A" /></bpmn:process>
  <bpmn:process id="Process_B"><bpmn:task id="Task_B" /></bpmn:process>
  <bpmn:process id="Process_L">
    <bpmn:laneSet id="LaneSet_L">
      <bpmn:lane id="Lane_L">
        <bpmn:childLaneSet id="LaneSet_Inner"><bpmn:lane id="Lane_Inner" /></bpmn:childLaneSet>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:task id="Task_L" />
  </bpmn:process>
  <bpmn:process id="Process_Loose"><bpmn:task id="Task_Loose" /></bpmn:process>`;

const shape = (element: string) => `
      <bpmndi:BPMNShape id="${element}_di" bpmnElement="${element}">
        <dc:Bounds x="0" y="0" width="100" height="80" />
      </bpmndi:BPMNShape>`;

const plane = (owner: string, elements: readonly string[]) => `
  <bpmndi:BPMNDiagram id="Diagram_${owner}">
    <bpmndi:BPMNPlane id="Plane_${owner}" bpmnElement="${owner}">${elements.map(shape).join("")}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>`;

async function versionOf(diagrams: string): Promise<VersionSnapshots> {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">${SEMANTIC}${diagrams}
</bpmn:definitions>`;
    return VersionSnapshots.of(await elementSnapshots(xml, { isUnit: isMergeElement }));
}

describe("VersionSnapshots.draws", () => {
    it("draws an element with a shape or a plane of its own, and none without", async () => {
        const version = await versionOf(plane("Process_Loose", ["Task_Loose"]));

        expect([version.draws("Process_Loose"), version.draws("Task_Loose")]).toEqual([true, true]);
        expect(version.draws("Task_L")).toBe(false);
    });

    it.each([
        ["Lane_L", "a lane"],
        ["Lane_Inner", "a nested lane"],
        ["Task_L", "a flow node"],
    ])(
        "draws a process with lanes when the collaboration's plane draws %s of it (%s)",
        async (element) => {
            const version = await versionOf(plane("Collab_1", ["Pool_A", element]));

            expect(version.draws("Process_L")).toBe(true);
        },
    );

    it("draws a process only a participant without an id names from what the collaboration's plane draws of it", async () => {
        const version = await versionOf(plane("Collab_1", ["Pool_A", "Task_B"]));

        expect(version.draws("Process_B")).toBe(true);
    });

    it("does not draw a process with lanes when the collaboration's plane draws nothing of it", async () => {
        const version = await versionOf(plane("Collab_1", ["Pool_A", "Task_A"]));

        expect(version.draws("Process_L")).toBe(false);
    });

    it("leaves a process a pool names to its pool", async () => {
        const version = await versionOf(plane("Collab_1", ["Pool_A", "Task_A"]));

        expect(version.draws("Process_A")).toBe(false);
    });

    it("does not draw a process bpmn-js does not reach from the collaboration's plane", async () => {
        const version = await versionOf(plane("Collab_1", ["Pool_A", "Task_Loose"]));

        expect(version.draws("Process_Loose")).toBe(false);
    });

    it("does not draw a process with lanes from another process's plane", async () => {
        const version = await versionOf(plane("Process_A", ["Task_L"]));

        expect(version.draws("Process_L")).toBe(false);
    });
});
