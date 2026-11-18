import { type ModdleElement, createDocumentModdle } from "@miragon/bpmn-modeler-diff";
import { describe, expect, it } from "vitest";

import { spliceHandMergedText } from "./handMergeSplice";
import { isMergeUnit, parseElementText } from "./handMergeText";

const BPMN = 'xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"';
const CUSTOM = 'xmlns:custom="urn:custom"';

const DOCUMENT = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions ${BPMN} ${CUSTOM} id="Definitions_1" targetNamespace="urn:test">
  <bpmn:process id="Process_1">
    <bpmn:dataObject id="DataObject_1" />
    <bpmn:dataObjectReference id="DataRef_1" dataObjectRef="DataObject_1" />
    <bpmn:dataStoreReference id="DataStoreRef_1" />
    <bpmn:task id="Task_1" custom:b="2" custom:a="1">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:property id="Property_Old" />
      <bpmn:dataInputAssociation id="Association_Own">
        <bpmn:sourceRef>DataRef_1</bpmn:sourceRef>
        <bpmn:targetRef>Property_Old</bpmn:targetRef>
      </bpmn:dataInputAssociation>
    </bpmn:task>
    <bpmn:boundaryEvent id="Boundary_1" attachedToRef="Task_1" />
    <bpmn:exclusiveGateway id="Gateway_1" default="Flow_2" />
    <bpmn:endEvent id="End_1" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Gateway_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Gateway_1" targetRef="End_1" />
  </bpmn:process>
</bpmn:definitions>`;

async function spliced(id: string, type: string, text: string) {
    const moddle = await createDocumentModdle([DOCUMENT]);
    const document = await moddle.moddle.fromXML(DOCUMENT);
    const unit = document.elementsById[id]!;
    const parsed = await parseElementText(moddle, text, type);
    spliceHandMergedText(unit, parsed, "ownContent", isMergeUnit, (outer) => document.elementsById[outer]);
    return { unit, byId: (target: string) => document.elementsById[target], moddle };
}

const ids = (value: unknown) => (value as ModdleElement[]).map((element) => element.id);

describe("spliceHandMergedText", () => {
    it("keeps default, attachedToRef and data-association sourceRef pointing at the document's elements", async () => {
        const gateway = await spliced(
            "Gateway_1",
            "bpmn:ExclusiveGateway",
            `<bpmn:exclusiveGateway ${BPMN} id="Gateway_1" name="Ok?" default="Flow_2" />`,
        );
        expect(gateway.unit.default).toBe(gateway.byId("Flow_2"));
        expect(gateway.unit.name).toBe("Ok?");

        const boundary = await spliced(
            "Boundary_1",
            "bpmn:BoundaryEvent",
            `<bpmn:boundaryEvent ${BPMN} id="Boundary_1" name="Late" attachedToRef="Task_1" />`,
        );
        expect(boundary.unit.attachedToRef).toBe(boundary.byId("Task_1"));

        const task = await spliced(
            "Task_1",
            "bpmn:Task",
            `<bpmn:task ${BPMN} id="Task_1">
  <bpmn:property id="Property_New" />
  <bpmn:dataInputAssociation>
    <bpmn:sourceRef>DataStoreRef_1</bpmn:sourceRef>
    <bpmn:targetRef>Property_New</bpmn:targetRef>
  </bpmn:dataInputAssociation>
</bpmn:task>`,
        );
        const [own, association] = task.unit.dataInputAssociations as ModdleElement[];
        expect(association!.sourceRef).toEqual([task.byId("DataStoreRef_1")]);
        expect(association!.targetRef).toBe((task.unit.properties as ModdleElement[])[0]);
        expect((task.unit.properties as ModdleElement[])[0]!.$parent).toBe(task.unit);
        expect(association!.$parent).toBe(task.unit);
        expect(own).toBe(task.byId("Association_Own"));
    });

    it("keeps a mixed inner and outer reference collection in its order", async () => {
        const { unit, byId } = await spliced(
            "Task_1",
            "bpmn:Task",
            `<bpmn:task ${BPMN} id="Task_1">
  <bpmn:property id="Property_New" />
  <bpmn:dataInputAssociation>
    <bpmn:sourceRef>DataRef_1</bpmn:sourceRef>
    <bpmn:sourceRef>Property_New</bpmn:sourceRef>
    <bpmn:sourceRef>DataStoreRef_1</bpmn:sourceRef>
    <bpmn:targetRef>Property_New</bpmn:targetRef>
  </bpmn:dataInputAssociation>
</bpmn:task>`,
        );

        const [, association] = unit.dataInputAssociations as ModdleElement[];
        expect(ids(association!.sourceRef)).toEqual(["DataRef_1", "Property_New", "DataStoreRef_1"]);
        expect((association!.sourceRef as ModdleElement[])[0]).toBe(byId("DataRef_1"));
    });

    it("keeps the unit's own elements and derived references and drops what the text leaves out", async () => {
        const { unit, byId } = await spliced(
            "Task_1",
            "bpmn:Task",
            `<bpmn:task ${BPMN} id="Task_1" name="Renamed" />`,
        );

        expect(unit.name).toBe("Renamed");
        expect(unit.properties).toBeUndefined();
        expect(unit.dataInputAssociations).toEqual([byId("Association_Own")]);
        expect(ids(unit.incoming)).toEqual(["Flow_1"]);
    });

    it("keeps the foreign attributes in the unit's order and drops namespace declarations", async () => {
        const { unit } = await spliced(
            "Task_1",
            "bpmn:Task",
            `<bpmn:task ${BPMN} ${CUSTOM} id="Task_1" custom:a="1" custom:b="3" custom:c="4" />`,
        );

        expect(Object.entries(unit.$attrs ?? {})).toEqual([
            ["custom:b", "3"],
            ["custom:a", "1"],
            ["custom:c", "4"],
        ]);
    });
});
