import { describe, expect, it } from "vitest";

import { detectEngine } from "./detectEngine";
import { extractModelDefinitions } from "./extractModelDefinitions";

/**
 * Smoke test for the root entry's pure helpers. The local wrappers only exist so
 * the rolled-up `.d.ts` stays clean; the parsing rules are tested in
 * `@miragon/bpmn-modeler-types`.
 */

function definitions(attributes: string, body = ""): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:modeler="http://camunda.org/schema/modeler/1.0" id="Definitions_1" ${attributes}>${body}</bpmn:definitions>`;
}

describe("public pure helpers", () => {
    it.each([
        ['modeler:executionPlatform="Camunda Platform"', "c7"],
        ['modeler:executionPlatform="Camunda Cloud"', "c8"],
        ["", undefined],
    ])("detectEngine reads %j as %s", (attributes, engine) => {
        expect(detectEngine(definitions(attributes))).toBe(engine);
    });

    it("extractModelDefinitions lists a message with the event that catches it", () => {
        const xml = definitions(
            "",
            `<bpmn:process id="Process_1">
               <bpmn:startEvent id="Start" name="Order received">
                 <bpmn:messageEventDefinition messageRef="Message_Order" />
               </bpmn:startEvent>
             </bpmn:process>
             <bpmn:message id="Message_Order" name="order" />`,
        );

        expect(extractModelDefinitions(xml)).toEqual([
            expect.objectContaining({
                kind: "message",
                name: "order",
                usages: [expect.objectContaining({ elementId: "Start", role: "catch" })],
            }),
        ]);
    });
});
