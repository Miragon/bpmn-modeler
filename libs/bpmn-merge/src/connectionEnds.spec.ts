import { type ModdleElement, loadBpmnModdle } from "@miragon/bpmn-modeler-diff";
import { describe, expect, it } from "vitest";

import { type ConnectionEnds, connectionEndsOf, edgePlaneOf } from "./connectionEnds";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1">
    <bpmn:dataObject id="DataObject_1" />
    <bpmn:dataObjectReference id="DataRef_1" dataObjectRef="DataObject_1" />
    <bpmn:task id="Task_A">
      <bpmn:dataInputAssociation id="DataInput_A">
        <bpmn:sourceRef>DataRef_1</bpmn:sourceRef>
      </bpmn:dataInputAssociation>
      <bpmn:dataOutputAssociation id="DataOutput_A">
        <bpmn:targetRef>DataRef_1</bpmn:targetRef>
      </bpmn:dataOutputAssociation>
    </bpmn:task>
    <bpmn:task id="Task_B" />
    <bpmn:sequenceFlow id="Flow_AB" sourceRef="Task_A" targetRef="Task_B" />
    <bpmn:textAnnotation id="Note_1" />
    <bpmn:association id="Association_1" sourceRef="Flow_AB" targetRef="Note_1" />
  </bpmn:process>
</bpmn:definitions>
`;

describe("connectionEndsOf", () => {
    it.each<[string, ConnectionEnds | undefined]>([
        ["DataInput_A", { source: "DataRef_1", target: "Task_A" }],
        ["DataOutput_A", { source: "Task_A", target: "DataRef_1" }],
        ["Flow_AB", { source: "Task_A", target: "Task_B" }],
        ["Association_1", { source: "Flow_AB", target: "Note_1" }],
        ["Task_A", undefined],
    ])("joins %s's edge to %o", async (id, ends) => {
        const { elementsById } = await (await loadBpmnModdle())().fromXML(XML);

        expect(connectionEndsOf(elementsById[id] as ModdleElement)).toEqual(ends);
    });

    it("takes the activity a data association is held by from the caller", async () => {
        const { elementsById } = await (await loadBpmnModdle())().fromXML(XML);
        const holder = elementsById["Task_B"] as ModdleElement;

        expect(connectionEndsOf(elementsById["DataInput_A"] as ModdleElement, holder)).toEqual({
            source: "DataRef_1",
            target: "Task_B",
        });
    });
});

describe("edgePlaneOf", () => {
    const planes: Readonly<Record<string, string>> = {
        Task_A: "Process_1",
        Task_B: "Process_1",
        Task_In: "Sub_1",
    };

    it.each<[ConnectionEnds, string | undefined]>([
        [{ source: "Task_A", target: "Task_B" }, "Process_1"],
        [{ source: "Task_In", target: "Task_B" }, undefined],
        [{ source: "Task_A", target: "Task_Undrawn" }, undefined],
        [{ source: "Task_Undrawn", target: "Task_Gone" }, undefined],
        [{ target: "Task_B" }, undefined],
    ])("puts an edge between %o on %s", (ends, plane) => {
        expect(edgePlaneOf(ends, (id) => planes[id])).toBe(plane);
    });
});
