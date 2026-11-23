import { elementSnapshots, idOf, moddleElements } from "@miragon/bpmn-modeler-diff";
import { describe, expect, it } from "vitest";

import { parseWithoutWarnings } from "../../__fixtures__/parseWithoutWarnings";
import { rootsReachedFrom } from "../../build/domain/collaborationPools";
import { isMergeElement } from "../../kernel/domain/mergeElements";
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
  <bpmn:process id="Process_Loose"><bpmn:task id="Task_Loose" /></bpmn:process>
  <bpmn:process id="Process_Sub">
    <bpmn:subProcess id="Sub_1">
      <bpmn:laneSet id="LaneSet_Sub"><bpmn:lane id="Lane_Sub" /></bpmn:laneSet>
      <bpmn:task id="Task_Sub" />
    </bpmn:subProcess>
  </bpmn:process>`;

const shape = (element: string) => `
      <bpmndi:BPMNShape id="${element}_di" bpmnElement="${element}">
        <dc:Bounds x="0" y="0" width="100" height="80" />
      </bpmndi:BPMNShape>`;

const plane = (owner: string, elements: readonly string[]) => `
  <bpmndi:BPMNDiagram id="Diagram_${owner}">
    <bpmndi:BPMNPlane id="Plane_${owner}" bpmnElement="${owner}">${elements.map(shape).join("")}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>`;

const documentOf = (diagrams: string) => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">${SEMANTIC}${diagrams}
</bpmn:definitions>`;

async function versionOf(diagrams: string): Promise<VersionSnapshots> {
    return VersionSnapshots.of(
        await elementSnapshots(documentOf(diagrams), { isUnit: isMergeElement }),
    );
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

describe("VersionSnapshots.draws and rootsReachedFrom", () => {
    const PROCESSES = ["Process_A", "Process_B", "Process_L", "Process_Loose", "Process_Sub"];
    const NODE_OF: Record<string, string> = {
        Process_A: "Task_A",
        Process_B: "Task_B",
        Process_L: "Task_L",
        Process_Loose: "Task_Loose",
        Process_Sub: "Task_Sub",
    };

    it("count the same processes as drawn from the collaboration's plane when it draws a node of each", async () => {
        const diagrams = plane("Collab_1", ["Pool_A", ...PROCESSES.map((id) => NODE_OF[id])]);
        const version = await versionOf(diagrams);
        const definitions = (await parseWithoutWarnings(documentOf(diagrams))).rootElement;
        const collaboration = moddleElements(definitions.rootElements).find(
            ({ id }) => id === "Collab_1",
        );
        const pooled = new Set(
            moddleElements(collaboration?.participants)
                .filter(({ id }) => id !== undefined)
                .map(({ processRef }) => idOf(processRef)),
        );
        const reached = rootsReachedFrom(collaboration!);

        expect(PROCESSES.filter((id) => version.draws(id))).toEqual(
            PROCESSES.filter((id) => reached.has(id) && !pooled.has(id)),
        );
    });
});
