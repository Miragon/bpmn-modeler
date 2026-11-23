import { describe, expect, it } from "vitest";

import { buildMerged } from "./buildMerged";
import { prepareMergeSources } from "../../sources/service/buildMergedSources";
import { type MergeVersions, computeMerge } from "../../classify/service/computeMerge";
import { MergeDecisions } from "../../decide/domain/mergeDecisions";

const SEMANTIC = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_A" processRef="Process_A" />
  </bpmn:collaboration>
  <bpmn:process id="Process_A" isExecutable="false">
    <bpmn:task id="Task_A" />
  </bpmn:process>
  <bpmn:process id="Process_L" isExecutable="false">
    <bpmn:laneSet id="LaneSet_L">
      <bpmn:lane id="Lane_L">
        <bpmn:flowNodeRef>Task_L</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:task id="Task_L" />
  </bpmn:process>`;

const POOL = `
      <bpmndi:BPMNShape id="Participant_A_di" bpmnElement="Participant_A" isHorizontal="true">
        <dc:Bounds x="0" y="0" width="600" height="250" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_A_di" bpmnElement="Task_A">
        <dc:Bounds x="100" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>`;

const laneAt = (y: number) => `
      <bpmndi:BPMNShape id="Lane_L_di" bpmnElement="Lane_L" isHorizontal="true">
        <dc:Bounds x="0" y="${y}" width="600" height="250" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_L_di" bpmnElement="Task_L">
        <dc:Bounds x="100" y="${y + 80}" width="100" height="80" />
      </bpmndi:BPMNShape>`;

const diagram = (id: string, owner: string, drawings: string) => `
  <bpmndi:BPMNDiagram id="${id}">
    <bpmndi:BPMNPlane id="${id}_plane" bpmnElement="${owner}">${drawings}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>`;

/** bpmn-js draws a process with lanes from the collaboration's plane even without a pool. */
const ON_THE_COLLABORATION_PLANE = `${SEMANTIC}${diagram("BPMNDiagram_1", "Collaboration_1", POOL + laneAt(300))}
</bpmn:definitions>
`;

const ON_ITS_OWN_DIAGRAM = `${SEMANTIC}${diagram("BPMNDiagram_1", "Collaboration_1", POOL)}${diagram("Diagram_L", "Process_L", laneAt(0))}
</bpmn:definitions>
`;

/** The collaboration's plane stays, yet no side of it draws the process's lane or task. */
const POOL_ONLY = `${SEMANTIC}${diagram("BPMNDiagram_1", "Collaboration_1", POOL)}
</bpmn:definitions>
`;

async function automaticMerge(versions: MergeVersions) {
    const decisions = MergeDecisions.from(await computeMerge(versions));
    return buildMerged(await prepareMergeSources(versions), decisions);
}

describe("buildMerged: a process with lanes that no pool names", () => {
    it("keeps the diagram of its own incoming moves it onto from the collaboration's plane", async () => {
        const { xml } = await automaticMerge({
            base: ON_THE_COLLABORATION_PLANE,
            current: ON_THE_COLLABORATION_PLANE,
            incoming: ON_ITS_OWN_DIAGRAM,
        });

        expect(xml).toBe(ON_ITS_OWN_DIAGRAM);
    });

    it("takes incoming's move onto the collaboration's plane without keeping current's diagram empty", async () => {
        const { xml } = await automaticMerge({
            base: ON_ITS_OWN_DIAGRAM,
            current: ON_ITS_OWN_DIAGRAM,
            incoming: ON_THE_COLLABORATION_PLANE,
        });

        expect(xml).toBe(ON_THE_COLLABORATION_PLANE);
    });

    it("keeps current's drawing on the collaboration's plane when both sides drew it", async () => {
        const { xml } = await automaticMerge({
            current: ON_THE_COLLABORATION_PLANE,
            incoming: ON_ITS_OWN_DIAGRAM,
        });

        expect(xml).toBe(ON_THE_COLLABORATION_PLANE);
    });

    it("keeps incoming's own diagram when current's collaboration plane draws nothing of the process", async () => {
        const { xml } = await automaticMerge({
            current: POOL_ONLY,
            incoming: ON_ITS_OWN_DIAGRAM,
        });

        expect(xml).toBe(ON_ITS_OWN_DIAGRAM);
    });

    it("keeps the own diagram when incoming's collaboration plane draws nothing of the process", async () => {
        const { xml } = await automaticMerge({
            base: ON_ITS_OWN_DIAGRAM,
            current: ON_ITS_OWN_DIAGRAM,
            incoming: POOL_ONLY,
        });

        expect(xml).toBe(ON_ITS_OWN_DIAGRAM);
    });
});
