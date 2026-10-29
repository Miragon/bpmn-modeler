import { describe, expect, it } from "vitest";

import { extractModelDefinitions, matchesDefinitionQuery } from "./workspaceDefinitions";

const ORDER_PROCESS = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_1">
  <bpmn:process id="order" isExecutable="true">
    <bpmn:startEvent id="Start" name="Order received">
      <bpmn:messageEventDefinition id="MED_1" messageRef="Message_Order" />
    </bpmn:startEvent>
    <bpmn:sendTask id="Notify" name="Notify shipping" messageRef="Message_Ship" />
    <bpmn:boundaryEvent id="Failed" attachedToRef="Notify">
      <bpmn:errorEventDefinition id="EED_1" errorRef="Error_Payment" camunda:errorCodeVariable="code" />
    </bpmn:boundaryEvent>
    <bpmn:intermediateThrowEvent id="Broadcast" name="Broadcast">
      <bpmn:signalEventDefinition id="SED_1" signalRef="Signal_Stock" />
    </bpmn:intermediateThrowEvent>
    <bpmn:endEvent id="Escalate">
      <bpmn:escalationEventDefinition escalationRef="Escalation_Late" />
    </bpmn:endEvent>
    <!-- <bpmn:receiveTask id="Commented" messageRef="Message_Order" /> -->
  </bpmn:process>
  <bpmn:message id="Message_Order" name="order &amp; payment" />
  <bpmn:message id="Message_Ship" name="ship" />
  <bpmn:message id="Message_Nameless" />
  <bpmn:error id="Error_Payment" name="Payment failed" errorCode="PAYMENT_FAILED" />
  <bpmn:signal id="Signal_Stock" name="stock" />
  <bpmn:escalation id="Escalation_Late" escalationCode="LATE" />
</bpmn:definitions>`;

describe("extractModelDefinitions", () => {
    const definitions = extractModelDefinitions(ORDER_PROCESS);

    it("lists every named root definition with its usages", () => {
        expect(definitions).toEqual([
            {
                kind: "message",
                name: "order & payment",
                code: undefined,
                usages: [
                    {
                        elementId: "Start",
                        elementName: "Order received",
                        elementType: "startEvent",
                        role: "catch",
                    },
                ],
            },
            {
                kind: "message",
                name: "ship",
                code: undefined,
                usages: [
                    {
                        elementId: "Notify",
                        elementName: "Notify shipping",
                        elementType: "sendTask",
                        role: "throw",
                    },
                ],
            },
            {
                kind: "error",
                name: "Payment failed",
                code: "PAYMENT_FAILED",
                usages: [
                    {
                        elementId: "Failed",
                        elementName: undefined,
                        elementType: "boundaryEvent",
                        role: "catch",
                    },
                ],
            },
            {
                kind: "signal",
                name: "stock",
                code: undefined,
                usages: [
                    {
                        elementId: "Broadcast",
                        elementName: "Broadcast",
                        elementType: "intermediateThrowEvent",
                        role: "throw",
                    },
                ],
            },
            {
                kind: "escalation",
                name: undefined,
                code: "LATE",
                usages: [
                    {
                        elementId: "Escalate",
                        elementName: undefined,
                        elementType: "endEvent",
                        role: "throw",
                    },
                ],
            },
        ]);
    });

    it("reads unprefixed models with a default namespace", () => {
        const xml = `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
            <process id="p"><receiveTask id="Wait" messageRef="M" /></process>
            <message id="M" name="paid" />
        </definitions>`;

        expect(extractModelDefinitions(xml)).toEqual([
            {
                kind: "message",
                name: "paid",
                code: undefined,
                usages: [
                    {
                        elementId: "Wait",
                        elementName: undefined,
                        elementType: "receiveTask",
                        role: "catch",
                    },
                ],
            },
        ]);
    });

    it("ignores markup inside comments and CDATA", () => {
        const xml = `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
            <!-- <bpmn:message id="C" name="commented" /> -->
            <bpmn:message id="M" name="kept" />
            <bpmn:documentation><![CDATA[ <bpmn:signal id="S" name="cdata" /> ]]></bpmn:documentation>
        </bpmn:definitions>`;

        expect(extractModelDefinitions(xml).map(({ name }) => name)).toEqual(["kept"]);
    });

    it("lists markup after an unterminated comment, which hides nothing", () => {
        const xml = `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
            <bpmn:message id="M" name="kept" />
            <!-- <bpmn:message id="U" name="unclosed" />
        </bpmn:definitions>`;

        expect(extractModelDefinitions(xml).map(({ name }) => name)).toEqual(["kept", "unclosed"]);
    });

    it("stays fast on pathological input", () => {
        const startedAt = Date.now();

        extractModelDefinitions("<!--".repeat(100_000));
        extractModelDefinitions(`<bpmn:message ${"!".repeat(100_000)} />`);
        extractModelDefinitions(`<bpmn:message ${" ".repeat(100_000)}id="M" />`);

        expect(Date.now() - startedAt).toBeLessThan(1000);
    });

    it("ignores definition-like elements nested below the root", () => {
        const xml = `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
            <bpmn:process id="p"><bpmn:extensionElements><x:message id="X" name="nested" /></bpmn:extensionElements></bpmn:process>
        </bpmn:definitions>`;

        expect(extractModelDefinitions(xml)).toEqual([]);
    });
});

describe("matchesDefinitionQuery", () => {
    const error = {
        kind: "error" as const,
        name: "Payment failed",
        code: "PAYMENT_FAILED",
        usages: [],
    };

    it("matches name or code case-insensitively within the same kind", () => {
        expect(matchesDefinitionQuery(error, { kind: "error", text: "payment f" })).toBe(true);
        expect(matchesDefinitionQuery(error, { kind: "error", text: "_failed" })).toBe(true);
    });

    it("rejects other kinds and non-matching text", () => {
        expect(matchesDefinitionQuery(error, { kind: "message", text: "payment" })).toBe(false);
        expect(matchesDefinitionQuery(error, { kind: "error", text: "shipping" })).toBe(false);
    });
});
