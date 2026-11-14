// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../types/bpmn-js-differ.d.ts" />
import { ChangeHandler } from "bpmn-js-differ";
import { describe, expect, it } from "vitest";

import { ModdleElement, loadBpmnModdle } from "../bpmnModdleFactory";
import { walkContainment } from "../moddleContainment";
import { isTrackedElement, trackedElementOf } from "../trackedElements";
import { MOCK_DIFF_AFTER_XML, MOCK_DIFF_BEFORE_XML } from "../__fixtures__/mock-diff";
import { ALL_EXECUTION_PROPERTY_FIXTURES } from "../__fixtures__/execution-properties";

const NAMESPACES = `xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:custom="urn:miragon:custom"`;

const COLLABORATION_XML = `<bpmn:definitions ${NAMESPACES} id="Definitions_1">
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" processRef="Process_1" />
    <bpmn:participant id="Participant_2" />
    <bpmn:messageFlow id="MessageFlow_1" sourceRef="Participant_1" targetRef="Participant_2" />
    <bpmn:textAnnotation id="Note_1" />
  </bpmn:collaboration>
  <bpmn:process id="Process_1">
    <bpmn:laneSet id="LaneSet_1"><bpmn:lane id="Lane_1"><bpmn:flowNodeRef>Task_1</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet>
    <bpmn:dataObject id="DataObject_1" />
    <bpmn:dataObjectReference id="DataRef_1" dataObjectRef="DataObject_1" />
    <bpmn:task id="Task_1">
      <bpmn:extensionElements><custom:meta owner="billing" /></bpmn:extensionElements>
      <bpmn:dataOutputAssociation id="OutputAssociation_1"><bpmn:targetRef>DataRef_1</bpmn:targetRef></bpmn:dataOutputAssociation>
    </bpmn:task>
    <bpmn:subProcess id="Sub_1"><bpmn:task id="Sub_1_Task" /></bpmn:subProcess>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Task_1" targetRef="Sub_1" />
  </bpmn:process>
  <bpmn:process id="Process_Unreferenced" custom:owner="nobody">
    <bpmn:task id="Task_Unreferenced" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Collaboration_1">
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1"><dc:Bounds x="0" y="0" width="100" height="80" /></bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

const FIXTURES: ReadonlyArray<readonly [string, string]> = [
    ["a collaboration with an unreferenced process", COLLABORATION_XML],
    ["a process without a collaboration", MOCK_DIFF_BEFORE_XML],
    ["the changed process", MOCK_DIFF_AFTER_XML],
    ...ALL_EXECUTION_PROPERTY_FIXTURES.flatMap(
        ({ name, before, after }) =>
            [
                [`${name} (before)`, before],
                [`${name} (after)`, after],
            ] as const,
    ),
];

async function everyElementOf(xml: string): Promise<ModdleElement[]> {
    const { rootElement } = await (await loadBpmnModdle())().fromXML(xml);
    const elements: ModdleElement[] = [];
    walkContainment(rootElement, (element) => elements.push(element));
    return elements;
}

function upstreamTrackedElement(element: ModdleElement): unknown {
    const tracked = ChangeHandler.prototype._isTracked(element);
    return tracked ? tracked.element : undefined;
}

describe("trackedElementOf (bpmn-js-differ ChangeHandler._isTracked pin)", () => {
    it.each(FIXTURES)("agrees with bpmn-js-differ on every element of %s", async (_label, xml) => {
        const elements = await everyElementOf(xml);

        const disagreements = elements
            .filter((element) => trackedElementOf(element) !== upstreamTrackedElement(element))
            .map((element) => `${element.$type}#${element.id ?? "?"}`);

        expect(elements.length).toBeGreaterThan(1);
        expect(disagreements).toEqual([]);
    });

    it("reports a pool's process under its participant and leaves an unreferenced process untracked", async () => {
        const elements = await everyElementOf(COLLABORATION_XML);
        const byId = (id: string) => elements.find((element) => element.id === id)!;

        expect(trackedElementOf(byId("Process_1"))).toBe(byId("Participant_1"));
        expect(isTrackedElement(byId("Process_Unreferenced"))).toBe(false);
        expect(isTrackedElement(byId("Task_Unreferenced"))).toBe(true);
        expect(isTrackedElement(byId("DataObject_1"))).toBe(false);
    });
});
