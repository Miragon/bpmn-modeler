import { extractImplementationRefs } from "./bpmnXmlParser";

/**
 * Minimal BPMN XML wrapper used to build test inputs.
 */
function wrapBpmn(content: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions
    xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
    xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
    xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"
    id="Definitions_1"
    targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    ${content}
  </bpmn:process>
</bpmn:definitions>`;
}

describe("extractImplementationRefs", () => {
    it("should extract camunda:class (javaClass)", () => {
        const xml = wrapBpmn(
            `<bpmn:serviceTask id="Task_1" camunda:class="com.example.MyDelegate" />`,
        );
        const refs = extractImplementationRefs(xml);
        expect(refs).toEqual([
            { activityId: "Task_1", kind: "javaClass", identifier: "com.example.MyDelegate" },
        ]);
    });

    it("should extract camunda:delegateExpression", () => {
        const xml = wrapBpmn(
            `<bpmn:serviceTask id="Task_2" camunda:delegateExpression="\${myBean}" />`,
        );
        const refs = extractImplementationRefs(xml);
        expect(refs).toEqual([
            { activityId: "Task_2", kind: "delegateExpression", identifier: "${myBean}" },
        ]);
    });

    it("should extract camunda:expression", () => {
        const xml = wrapBpmn(
            `<bpmn:serviceTask id="Task_3" camunda:expression="\${svc.run()}" />`,
        );
        const refs = extractImplementationRefs(xml);
        expect(refs).toEqual([
            { activityId: "Task_3", kind: "expression", identifier: "${svc.run()}" },
        ]);
    });

    it("should extract camunda:type=external + camunda:topic (externalTask)", () => {
        const xml = wrapBpmn(
            `<bpmn:serviceTask id="Task_4" camunda:type="external" camunda:topic="payment" />`,
        );
        const refs = extractImplementationRefs(xml);
        expect(refs).toEqual([
            { activityId: "Task_4", kind: "externalTask", identifier: "payment" },
        ]);
    });

    it("should extract zeebe:taskDefinition type (jobType)", () => {
        const xml = wrapBpmn(`
            <bpmn:serviceTask id="Task_5">
                <bpmn:extensionElements>
                    <zeebe:taskDefinition type="payment-service" />
                </bpmn:extensionElements>
            </bpmn:serviceTask>
        `);
        const refs = extractImplementationRefs(xml);
        expect(refs).toEqual([
            { activityId: "Task_5", kind: "jobType", identifier: "payment-service" },
        ]);
    });

    it("should extract refs from sendTask and businessRuleTask", () => {
        const xml = wrapBpmn(`
            <bpmn:sendTask id="Send_1" camunda:class="com.example.Sender" />
            <bpmn:businessRuleTask id="BR_1" camunda:delegateExpression="\${ruleBean}" />
        `);
        const refs = extractImplementationRefs(xml);
        expect(refs).toHaveLength(2);
        expect(refs[0]).toEqual({
            activityId: "Send_1",
            kind: "javaClass",
            identifier: "com.example.Sender",
        });
        expect(refs[1]).toEqual({
            activityId: "BR_1",
            kind: "delegateExpression",
            identifier: "${ruleBean}",
        });
    });

    it("should skip service tasks without implementation", () => {
        const xml = wrapBpmn(`<bpmn:serviceTask id="Task_Empty" />`);
        const refs = extractImplementationRefs(xml);
        expect(refs).toEqual([]);
    });

    it("should skip camunda:type=external without topic", () => {
        const xml = wrapBpmn(
            `<bpmn:serviceTask id="Task_NoTopic" camunda:type="external" />`,
        );
        const refs = extractImplementationRefs(xml);
        expect(refs).toEqual([]);
    });

    it("should handle multiple service tasks", () => {
        const xml = wrapBpmn(`
            <bpmn:serviceTask id="A" camunda:class="com.a.ClassA" />
            <bpmn:serviceTask id="B" camunda:class="com.b.ClassB" />
        `);
        const refs = extractImplementationRefs(xml);
        expect(refs).toHaveLength(2);
        expect(refs[0].activityId).toBe("A");
        expect(refs[1].activityId).toBe("B");
    });

    it("should return empty array for XML without tasks", () => {
        const xml = wrapBpmn(`<bpmn:startEvent id="Start_1" />`);
        const refs = extractImplementationRefs(xml);
        expect(refs).toEqual([]);
    });

    it("should prioritize camunda:class over other C7 attributes", () => {
        const xml = wrapBpmn(
            `<bpmn:serviceTask id="Task_Multi"
                camunda:class="com.example.Foo"
                camunda:delegateExpression="\${bar}" />`,
        );
        const refs = extractImplementationRefs(xml);
        expect(refs).toHaveLength(1);
        expect(refs[0].kind).toBe("javaClass");
    });
});
