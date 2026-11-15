import { type ModdleElement, loadBpmnModdle } from "@miragon/bpmn-modeler-diff";
import { beforeAll, describe, expect, it } from "vitest";

import { isMergeElement } from "./mergeElements";

const EVERY_KIND = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="urn:test">
  <bpmn:message id="Message_1" name="Order" />
  <bpmn:error id="Error_1" errorCode="E1" />
  <bpmn:signal id="Signal_1" name="Alarm" />
  <bpmn:escalation id="Escalation_1" escalationCode="LATE" />
  <bpmn:dataStore id="DataStore_1" name="Stock" />
  <bpmn:itemDefinition id="ItemDefinition_1" structureRef="Order" />
  <bpmn:category id="Category_1">
    <bpmn:categoryValue id="CategoryValue_1" value="Billing" />
  </bpmn:category>
  <bpmn:interface id="Interface_1" name="Orders">
    <bpmn:operation id="Operation_1" name="place" />
  </bpmn:interface>
  <bpmn:correlationProperty id="CorrelationProperty_1" />
  <bpmn:resource id="Resource_1" />
  <bpmn:partnerRole id="PartnerRole_1" />
  <bpmn:globalTask id="GlobalTask_1" />
  <bpmn:endPoint id="EndPoint_1" />
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" processRef="Process_1" />
    <bpmn:participant id="Participant_2" />
    <bpmn:messageFlow id="MessageFlow_1" sourceRef="Participant_2" targetRef="Task_1" />
    <bpmn:group id="Group_1" categoryValueRef="CategoryValue_1" />
  </bpmn:collaboration>
  <bpmn:process id="Process_1">
    <bpmn:laneSet id="LaneSet_1">
      <bpmn:lane id="Lane_1">
        <bpmn:flowNodeRef>Task_1</bpmn:flowNodeRef>
        <bpmn:childLaneSet id="LaneSet_2">
          <bpmn:lane id="Lane_2" />
        </bpmn:childLaneSet>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:dataObject id="DataObject_1" />
    <bpmn:dataObjectReference id="DataObjectReference_1" dataObjectRef="DataObject_1" />
    <bpmn:dataStoreReference id="DataStoreReference_1" dataStoreRef="DataStore_1" />
    <bpmn:task id="Task_1">
      <bpmn:ioSpecification id="IoSpecification_1">
        <bpmn:dataInput id="DataInput_1" itemSubjectRef="ItemDefinition_1" />
        <bpmn:inputSet id="InputSet_1" />
      </bpmn:ioSpecification>
      <bpmn:dataInputAssociation id="DataInputAssociation_1">
        <bpmn:sourceRef>DataObjectReference_1</bpmn:sourceRef>
        <bpmn:targetRef>DataInput_1</bpmn:targetRef>
      </bpmn:dataInputAssociation>
    </bpmn:task>
    <bpmn:boundaryEvent id="Boundary_1" attachedToRef="Task_1">
      <bpmn:timerEventDefinition id="TimerEventDefinition_1" />
    </bpmn:boundaryEvent>
    <bpmn:subProcess id="Sub_1">
      <bpmn:textAnnotation id="Note_2" />
    </bpmn:subProcess>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Task_1" targetRef="Sub_1">
      <bpmn:conditionExpression id="Expression_1">ok</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:textAnnotation id="Note_1" />
    <bpmn:association id="Association_1" sourceRef="Task_1" targetRef="Note_1" />
  </bpmn:process>
  <bpmn:process id="Process_Unreferenced" />
</bpmn:definitions>`;

let elementsById: Record<string, ModdleElement | undefined>;

beforeAll(async () => {
    const createBpmnModdle = await loadBpmnModdle();
    ({ elementsById } = await createBpmnModdle().fromXML(EVERY_KIND));
});

function elementNamed(id: string): ModdleElement {
    const element = elementsById[id];
    if (!element) throw new Error(`no element ${id} in the document`);
    return element;
}

describe("isMergeElement", () => {
    it.each([
        "Collaboration_1",
        "Participant_1",
        "Participant_2",
        "MessageFlow_1",
        "Group_1",
        "Process_1",
        "Process_Unreferenced",
        "Lane_1",
        "Lane_2",
        "DataObject_1",
        "DataObjectReference_1",
        "DataStoreReference_1",
        "Task_1",
        "DataInputAssociation_1",
        "Boundary_1",
        "Sub_1",
        "Note_1",
        "Note_2",
        "Association_1",
        "Flow_1",
        "Message_1",
        "Error_1",
        "Signal_1",
        "Escalation_1",
        "DataStore_1",
        "ItemDefinition_1",
        "Category_1",
        "Interface_1",
        "CorrelationProperty_1",
        "Resource_1",
        "PartnerRole_1",
        "GlobalTask_1",
        "EndPoint_1",
    ])("makes %s an element of its own", (id) => {
        expect(isMergeElement(elementNamed(id))).toBe(true);
    });

    it.each([
        "LaneSet_1",
        "LaneSet_2",
        "IoSpecification_1",
        "DataInput_1",
        "InputSet_1",
        "TimerEventDefinition_1",
        "Expression_1",
        "CategoryValue_1",
        "Operation_1",
        "Definitions_1",
    ])("keeps %s inside its element", (id) => {
        expect(isMergeElement(elementNamed(id))).toBe(false);
    });
});
