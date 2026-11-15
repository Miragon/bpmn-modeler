import { describe, expect, it } from "vitest";

import { createDocumentModdle } from "./documentModdle";
import { loadExecutionPackage } from "./executionPackages";

const BPMN = "http://www.omg.org/spec/BPMN/20100524/MODEL";
const CAMUNDA = "http://camunda.org/schema/1.0/bpmn";
const TEAM = "urn:miragon:team";

const declaring = (camundaPrefix: string, teamPrefix: string) =>
    `<bpmn:definitions xmlns:bpmn="${BPMN}" xmlns:${camundaPrefix}="${CAMUNDA}" xmlns:${teamPrefix}="${TEAM}" id="Definitions_1">
  <bpmn:process id="Process_1">
    <bpmn:task id="Task_1" ${camundaPrefix}:asyncBefore="true" ${teamPrefix}:owner="billing" />
  </bpmn:process>
</bpmn:definitions>`;

describe("createDocumentModdle", () => {
    it("names every namespace by the prefix the first source declares it with", async () => {
        const current = declaring("camunda", "team");
        const incoming = declaring("c", "t");
        const { moddle } = await createDocumentModdle([current, incoming]);

        const { elementsById } = await moddle.fromXML(incoming);

        expect(elementsById.Task_1!.$attrs).toEqual({
            "camunda:asyncBefore": "true",
            "team:owner": "billing",
        });
    });

    it("types an engine's attributes and names its namespace by the descriptor's prefix", async () => {
        const incoming = declaring("c", "t");
        const { moddle } = await createDocumentModdle(
            [incoming],
            await loadExecutionPackage("camunda"),
        );

        const { elementsById } = await moddle.fromXML(incoming);
        const { xml } = await moddle.toXML(elementsById.Task_1!, { preamble: false });

        expect(elementsById.Task_1!.asyncBefore).toBe(true);
        expect(elementsById.Task_1!.$attrs).toEqual({ "t:owner": "billing" });
        expect(xml).toContain('camunda:asyncBefore="true"');
    });
});
