import { describe, expect, it } from "vitest";

import { loadBpmnModdle } from "../bpmnModdleFactory";
import { createPrefixedModdle, serializerPrefixes } from "./moddleNamespaces";

const XSI = "http://www.w3.org/2001/XMLSchema-instance";
const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
const BPMN = "http://www.omg.org/spec/BPMN/20100524/MODEL";

const XML = `<bpmn:definitions xmlns:bpmn="${BPMN}" xmlns:xsi="${XSI}" xmlns:t="urn:miragon:team" id="Definitions_1">
  <bpmn:process id="Process_1">
    <bpmn:task id="Task_1" t:owner="billing" xml:lang="de" />
    <bpmn:sequenceFlow id="Flow_1">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">approved</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
  </bpmn:process>
</bpmn:definitions>`;

describe("moddle-xml namespaces (upstream pin)", () => {
    it("names the prefixes the serializer declares by itself", async () => {
        const prefixes = serializerPrefixes(await loadBpmnModdle());

        expect(prefixes.get("xsi")).toBe(XSI);
        expect(prefixes.get("xml")).toBe(XML_NAMESPACE);
        expect(prefixes.get("bpmn")).toBe(BPMN);
    });

    it("writes xsi:type and xml:lang without a declaration of ours", async () => {
        const { moddle } = createPrefixedModdle(await loadBpmnModdle(), new Map());
        const { elementsById } = await moddle.fromXML(XML);

        const { xml: flow } = await moddle.toXML(elementsById.Flow_1!, { preamble: false });
        const { xml: task } = await moddle.toXML(elementsById.Task_1!, { preamble: false });

        expect(flow).toContain(`xmlns:xsi="${XSI}"`);
        expect(flow).toContain('xsi:type="bpmn:tFormalExpression"');
        expect(task).toContain('xml:lang="de"');
        expect(task).not.toContain("xmlns:xml");
    });

    it("reports a renamed prefix under its nsMap prefix", async () => {
        const { moddle } = createPrefixedModdle(
            await loadBpmnModdle(),
            new Map([["urn:miragon:team", "team"]]),
        );

        const { elementsById } = await moddle.fromXML(XML);

        expect(elementsById.Task_1!.$attrs).toEqual({ "team:owner": "billing", "xml:lang": "de" });
    });
});

describe("createPrefixedModdle", () => {
    it("declares the nsMap prefixes a snippet uses and leaves the serializer's own to it", async () => {
        const { declarationsFor } = createPrefixedModdle(
            await loadBpmnModdle(),
            new Map([["urn:miragon:team", "team"]]),
        );

        expect(declarationsFor(["bpmn", "team", "xsi"], "Task_1")).toEqual(
            new Map([["team", "urn:miragon:team"]]),
        );
    });

    it("rejects a prefix that neither nsMap nor the serializer declares", async () => {
        const { declarationsFor } = createPrefixedModdle(await loadBpmnModdle(), new Map());

        expect(() => declarationsFor(["team"], "Task_1")).toThrow(
            "The XML of Task_1 uses the namespace prefix team, which it does not declare: moddle-xml names every namespace by its `nsMap` prefix or by one it declares itself.",
        );
    });
});
