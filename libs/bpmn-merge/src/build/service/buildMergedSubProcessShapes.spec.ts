import { describe, expect, it } from "vitest";

import { parseWithoutWarnings } from "../../__fixtures__/parseWithoutWarnings";
import { buildMerged } from "./buildMerged";
import { prepareMergeSources } from "../../sources/service/buildMergedSources";
import { computeMerge, type MergeVersions } from "../../classify/service/computeMerge";
import { DiagramIndex } from "../domain/diagramIndex";
import { MergeDecisions } from "../../decide/domain/mergeDecisions";

const shape = (element: string, x = 0) =>
    `<bpmndi:BPMNShape id="${element}_di" bpmnElement="${element}"><dc:Bounds x="${x}" y="0" width="100" height="80" /></bpmndi:BPMNShape>`;

const expandedWithoutBounds = (element: string) =>
    `<bpmndi:BPMNShape id="${element}_di" bpmnElement="${element}" isExpanded="true" />`;

const diagram = (owner: string, drawings: readonly string[]) => `
  <bpmndi:BPMNDiagram id="Diagram_${owner}">
    <bpmndi:BPMNPlane id="Plane_${owner}" bpmnElement="${owner}">${drawings.join("")}</bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>`;

const document = (
    semantic: string,
    diagrams: readonly string[],
) => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">${semantic}${diagrams.join("")}
</bpmn:definitions>`;

/** Incoming renames Task_A only, so neither side touches the sub-process. */
function renamingTaskA(current: string): MergeVersions {
    return {
        base: current,
        current,
        incoming: current.replace(
            `<bpmn:task id="Task_A" />`,
            `<bpmn:task id="Task_A" name="Renamed" />`,
        ),
    };
}

async function automaticMerge(versions: MergeVersions) {
    const decisions = MergeDecisions.from(await computeMerge(versions));
    return buildMerged(await prepareMergeSources(versions), decisions);
}

async function planeOwnersOf(xml: string, element: string) {
    const index = DiagramIndex.of((await parseWithoutWarnings(xml)).rootElement);
    return index.drawingsOf(element).map(({ planeOwner }) => planeOwner);
}

describe("buildMerged with a sub-process whose only shape lacks bounds", () => {
    it("keeps the contents on the root plane that shape lies on", async () => {
        const current = document(
            `
  <bpmn:process id="Process_1">
    <bpmn:task id="Task_A" />
  </bpmn:process>
  <bpmn:process id="Process_2">
    <bpmn:subProcess id="Sub_X">
      <bpmn:task id="Task_In" />
    </bpmn:subProcess>
  </bpmn:process>`,
            [
                diagram("Process_1", [shape("Task_A")]),
                diagram("Process_2", [expandedWithoutBounds("Sub_X"), shape("Task_In")]),
            ],
        );

        const { xml } = await automaticMerge(renamingTaskA(current));

        expect(await planeOwnersOf(xml, "Task_In")).toEqual(["Process_2"]);
    });

    it("keeps the contents on the plane of the collapsed sub-process that draws that shape", async () => {
        const current = document(
            `
  <bpmn:process id="Process_1">
    <bpmn:task id="Task_A" />
    <bpmn:subProcess id="Sub_1">
      <bpmn:subProcess id="Sub_2">
        <bpmn:task id="Task_In" />
      </bpmn:subProcess>
    </bpmn:subProcess>
  </bpmn:process>`,
            [
                diagram("Process_1", [shape("Task_A"), shape("Sub_1", 200)]),
                diagram("Sub_1", [expandedWithoutBounds("Sub_2"), shape("Task_In")]),
            ],
        );

        const { xml, notes } = await automaticMerge(renamingTaskA(current));

        expect(await planeOwnersOf(xml, "Task_In")).toEqual(["Sub_1"]);
        expect(notes).toEqual([]);
    });
});
