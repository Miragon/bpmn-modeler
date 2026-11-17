import { describe, expect, it } from "vitest";

import { loadBpmnModdle } from "./bpmnModdleFactory";
import { ownAttributeEntries } from "./moddleContainment";

const XML = `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:custom="urn:example:custom" id="Definitions_1">
  <bpmn:itemDefinition id="Item_A" isCollection="false" />
  <bpmn:dataStore id="Store_A" name="Archive" isUnlimited="true" capacity="5" itemSubjectRef="Item_A" custom:owner="billing" xmlns:other="urn:example:other" />
  <bpmn:interface id="Interface_A" name="Orders">
    <bpmn:operation id="Operation_A" name="Place" />
  </bpmn:interface>
  <bpmn:messageEventDefinition id="Definition_A">
    <bpmn:operationRef>Operation_A</bpmn:operationRef>
  </bpmn:messageEventDefinition>
</bpmn:definitions>`;

async function entriesOf(id: string) {
    const { elementsById } = await (await loadBpmnModdle())().fromXML(XML);
    return [...ownAttributeEntries(elementsById[id]!)].map(({ property, name, value }) => ({
        typed: property !== undefined,
        name,
        value,
    }));
}

describe("ownAttributeEntries", () => {
    it("gives the attributes the serializer writes, a reference as its target's id and a foreign one by its qualified name", async () => {
        expect(await entriesOf("Store_A")).toStrictEqual([
            { typed: true, name: "id", value: "Store_A" },
            { typed: true, name: "itemSubjectRef", value: "Item_A" },
            { typed: true, name: "name", value: "Archive" },
            { typed: true, name: "capacity", value: "5" },
            { typed: false, name: "custom:owner", value: "billing" },
        ]);
    });

    it("leaves out a value equal to the descriptor's default, which the serializer drops", async () => {
        expect(await entriesOf("Item_A")).toStrictEqual([
            { typed: true, name: "id", value: "Item_A" },
        ]);
    });

    it("leaves out a reference the serializer writes as a child element", async () => {
        expect(await entriesOf("Definition_A")).toStrictEqual([
            { typed: true, name: "id", value: "Definition_A" },
        ]);
    });
});
