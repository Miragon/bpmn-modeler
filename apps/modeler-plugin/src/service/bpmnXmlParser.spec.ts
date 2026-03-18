import {
    detectEngine,
    extractActivityDetails,
    extractImplementationRefs,
    extractProcessId,
} from "./bpmnXmlParser";

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

describe("extractActivityDetails", () => {
    it("should extract C7 camunda:inputOutput parameters", () => {
        const xml = wrapBpmn(`
            <bpmn:serviceTask id="Task_IO" name="Process Payment" camunda:class="com.example.Pay">
                <bpmn:extensionElements>
                    <camunda:inputOutput>
                        <camunda:inputParameter name="orderId">\${execution.getVariable("orderId")}</camunda:inputParameter>
                        <camunda:inputParameter name="amount">100</camunda:inputParameter>
                        <camunda:outputParameter name="paymentId">\${paymentResult}</camunda:outputParameter>
                    </camunda:inputOutput>
                </bpmn:extensionElements>
            </bpmn:serviceTask>
        `);
        const details = extractActivityDetails(xml);
        expect(details).toHaveLength(1);
        expect(details[0].activityId).toBe("Task_IO");
        expect(details[0].activityName).toBe("Process Payment");
        expect(details[0].implementation).toBeDefined();
        expect(details[0].implementation!.kind).toBe("javaClass");
        expect(details[0].inputs).toHaveLength(2);
        expect(details[0].inputs[0]).toEqual({
            name: "orderId",
            direction: "input",
            value: '${execution.getVariable("orderId")}',
        });
        expect(details[0].inputs[1]).toEqual({
            name: "amount",
            direction: "input",
            value: "100",
        });
        expect(details[0].outputs).toHaveLength(1);
        expect(details[0].outputs[0]).toEqual({
            name: "paymentId",
            direction: "output",
            value: "${paymentResult}",
        });
    });

    it("should extract C8 zeebe:ioMapping parameters", () => {
        const xml = wrapBpmn(`
            <bpmn:serviceTask id="Task_Zeebe" name="Send Email">
                <bpmn:extensionElements>
                    <zeebe:taskDefinition type="email-service" />
                    <zeebe:ioMapping>
                        <zeebe:input source="=orderId" target="emailOrderId" />
                        <zeebe:input source="=customer.email" target="recipient" />
                        <zeebe:output source="=sent" target="emailSent" />
                    </zeebe:ioMapping>
                </bpmn:extensionElements>
            </bpmn:serviceTask>
        `);
        const details = extractActivityDetails(xml);
        expect(details).toHaveLength(1);
        expect(details[0].activityId).toBe("Task_Zeebe");
        expect(details[0].activityName).toBe("Send Email");
        expect(details[0].implementation).toBeDefined();
        expect(details[0].implementation!.kind).toBe("jobType");
        expect(details[0].inputs).toHaveLength(2);
        expect(details[0].inputs[0]).toEqual({
            name: "emailOrderId",
            direction: "input",
            value: "=orderId",
        });
        expect(details[0].inputs[1]).toEqual({
            name: "recipient",
            direction: "input",
            value: "=customer.email",
        });
        expect(details[0].outputs).toHaveLength(1);
        expect(details[0].outputs[0]).toEqual({
            name: "emailSent",
            direction: "output",
            value: "=sent",
        });
    });

    it("should return empty I/O arrays for tasks without parameters", () => {
        const xml = wrapBpmn(
            `<bpmn:serviceTask id="Task_NoIO" camunda:class="com.example.Simple" />`,
        );
        const details = extractActivityDetails(xml);
        expect(details).toHaveLength(1);
        expect(details[0].inputs).toEqual([]);
        expect(details[0].outputs).toEqual([]);
    });

    it("should extract activity name attribute", () => {
        const xml = wrapBpmn(
            `<bpmn:serviceTask id="Task_Named" name="My Task" camunda:class="com.example.Foo" />`,
        );
        const details = extractActivityDetails(xml);
        expect(details[0].activityName).toBe("My Task");
    });

    it("should default activity name to empty string when not set", () => {
        const xml = wrapBpmn(
            `<bpmn:serviceTask id="Task_NoName" camunda:class="com.example.Foo" />`,
        );
        const details = extractActivityDetails(xml);
        expect(details[0].activityName).toBe("");
    });

    it("should extract tasks without implementation but with I/O", () => {
        const xml = wrapBpmn(`
            <bpmn:serviceTask id="Task_IOOnly" name="Manual">
                <bpmn:extensionElements>
                    <camunda:inputOutput>
                        <camunda:inputParameter name="key">value</camunda:inputParameter>
                    </camunda:inputOutput>
                </bpmn:extensionElements>
            </bpmn:serviceTask>
        `);
        const details = extractActivityDetails(xml);
        expect(details).toHaveLength(1);
        expect(details[0].implementation).toBeUndefined();
        expect(details[0].inputs).toHaveLength(1);
    });
});

describe("extractProcessId", () => {
    it("should extract the process id", () => {
        const xml = wrapBpmn(`<bpmn:startEvent id="Start_1" />`);
        expect(extractProcessId(xml)).toBe("Process_1");
    });

    it("should return 'unknown' for XML without a process", () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
    id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
</bpmn:definitions>`;
        expect(extractProcessId(xml)).toBe("unknown");
    });
});

describe("detectEngine", () => {
    it("should detect C7 when no Zeebe elements are present", () => {
        const xml = wrapBpmn(
            `<bpmn:serviceTask id="T1" camunda:class="com.example.Foo" />`,
        );
        expect(detectEngine(xml)).toBe("c7");
    });

    it("should detect C8 when Zeebe elements are present", () => {
        const xml = wrapBpmn(`
            <bpmn:serviceTask id="T1">
                <bpmn:extensionElements>
                    <zeebe:taskDefinition type="my-type" />
                </bpmn:extensionElements>
            </bpmn:serviceTask>
        `);
        expect(detectEngine(xml)).toBe("c8");
    });
});
