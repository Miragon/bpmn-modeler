import { parseWithoutWarnings } from "./parseWithoutWarnings";

export async function definitionsOf(semantic: string) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">${semantic}
</bpmn:definitions>`;
    return (await parseWithoutWarnings(xml)).rootElement;
}

/** A pooled process with nested lanes and a sub-process with lanes of its own, beside a black-box pool. */
export const POOLED_PROCESS_WITH_LANES = `
  <bpmn:collaboration id="Collab_1">
    <bpmn:participant id="Pool_A" processRef="Process_A" />
    <bpmn:participant id="Pool_Black_Box" />
  </bpmn:collaboration>
  <bpmn:process id="Process_A">
    <bpmn:laneSet id="LaneSet_A">
      <bpmn:lane id="Lane_Top">
        <bpmn:flowNodeRef>Task_1</bpmn:flowNodeRef>
        <bpmn:childLaneSet id="LaneSet_Child">
          <bpmn:lane id="Lane_Child">
            <bpmn:flowNodeRef>Task_1</bpmn:flowNodeRef>
          </bpmn:lane>
        </bpmn:childLaneSet>
      </bpmn:lane>
      <bpmn:lane id="Lane_Bottom">
        <bpmn:flowNodeRef>Sub_1</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_Inner</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:task id="Task_1" />
    <bpmn:subProcess id="Sub_1">
      <bpmn:laneSet id="LaneSet_Sub">
        <bpmn:lane id="Lane_Sub">
          <bpmn:flowNodeRef>Task_Inner</bpmn:flowNodeRef>
        </bpmn:lane>
      </bpmn:laneSet>
      <bpmn:task id="Task_Inner" />
    </bpmn:subProcess>
  </bpmn:process>`;
