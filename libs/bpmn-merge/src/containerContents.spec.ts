import { loadBpmnModdle } from "@miragon/bpmn-modeler-diff";
import { describe, expect, it } from "vitest";

import { enclosingSubProcessOf, isEnclosingContainer } from "./containerContents";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" processRef="Process_1" />
  </bpmn:collaboration>
  <bpmn:process id="Process_1">
    <bpmn:laneSet id="LaneSet_1">
      <bpmn:lane id="Lane_1" />
    </bpmn:laneSet>
    <bpmn:task id="Task_Top" />
    <bpmn:subProcess id="Sub_1">
      <bpmn:transaction id="Transaction_1">
        <bpmn:task id="Task_Deep" />
      </bpmn:transaction>
    </bpmn:subProcess>
    <bpmn:adHocSubProcess id="AdHoc_1" />
  </bpmn:process>
</bpmn:definitions>`;

async function elementsById() {
    return (await (await loadBpmnModdle())().fromXML(XML)).elementsById;
}

describe("isEnclosingContainer", () => {
    it.each([
        ["Sub_1", true],
        ["Transaction_1", true],
        ["AdHoc_1", true],
        ["Lane_1", true],
        ["Process_1", false],
        ["Participant_1", false],
        ["Task_Top", false],
    ])("tells whether %s draws its contents inside its shape", async (id, expected) => {
        expect(isEnclosingContainer((await elementsById())[id])).toBe(expected);
    });
});

describe("enclosingSubProcessOf", () => {
    it.each([
        ["Task_Deep", "Transaction_1"],
        ["Transaction_1", "Sub_1"],
        ["Task_Top", undefined],
    ])("finds the sub-process that holds %s", async (id, expected) => {
        expect(enclosingSubProcessOf((await elementsById())[id])).toBe(expected);
    });
});
