import { afterEach, describe, expect, it, vi } from "vitest";

import { computeDiff } from "./computeDiff";
import { elementXml } from "./elementXml";

const BPMN = "http://www.omg.org/spec/BPMN/20100524/MODEL";
const CAMUNDA = "http://camunda.org/schema/1.0/bpmn";
const ZEEBE = "http://camunda.org/schema/zeebe/1.0";
const CUSTOM = "urn:miragon:custom";
const TEAM = "urn:miragon:team";

function definitions(rootElements: string, extraNamespaces = ""): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="${BPMN}"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:camunda="${CAMUNDA}"
  xmlns:zeebe="${ZEEBE}"
  xmlns:custom="${CUSTOM}" ${extraNamespaces}
  id="Definitions_1" targetNamespace="urn:miragon:test">
${rootElements}
  <bpmndi:BPMNDiagram id="Diagram_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="100" y="100" width="100" height="80" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

/** The order of a start tag's namespace declarations is the serializer's, not a rule of `elementXml`. */
function withSortedDeclarations(xml: string | undefined): string | undefined {
    return xml?.replace(
        /(<[\w:.-]+)((?:\s+xmlns:[\w.-]+="[^"]*")+)/g,
        (_match, tagStart: string, declarations: string) =>
            tagStart +
            declarations
                .trim()
                .split(/\s+(?=xmlns:)/)
                .sort()
                .map((declaration) => ` ${declaration}`)
                .join(""),
    );
}

function expectSnippet(actual: string | undefined, expected: string): void {
    expect(withSortedDeclarations(actual)).toBe(withSortedDeclarations(expected));
}

function withProcess(flowElements: string, processAttributes = ""): string {
    return definitions(`  <bpmn:process id="Process_1" isExecutable="true" ${processAttributes}>
    ${flowElements}
  </bpmn:process>`);
}

describe("elementXml", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("keeps a task's own content and leaves out its diagram interchange", async () => {
        const xml =
            withProcess(`<bpmn:serviceTask id="Task_1" name="Charge" custom:owner="billing" camunda:asyncBefore="true">
      <bpmn:documentation>Charges the card</bpmn:documentation>
      <bpmn:extensionElements>
        <camunda:inputOutput><camunda:inputParameter name="amount">42</camunda:inputParameter></camunda:inputOutput>
        <zeebe:taskDefinition type="charge" retries="3" />
      </bpmn:extensionElements>
      <bpmn:ioSpecification id="IoSpec_1">
        <bpmn:dataInput id="DataInput_1" />
        <bpmn:inputSet id="InputSet_1"><bpmn:dataInputRefs>DataInput_1</bpmn:dataInputRefs></bpmn:inputSet>
      </bpmn:ioSpecification>
      <bpmn:multiInstanceLoopCharacteristics id="Loop_1" isSequential="true" />
    </bpmn:serviceTask>`);

        const snippet = await elementXml(xml, "Task_1");

        expectSnippet(
            snippet,
            `<bpmn:serviceTask xmlns:bpmn="${BPMN}" xmlns:camunda="${CAMUNDA}" xmlns:custom="${CUSTOM}" xmlns:zeebe="${ZEEBE}" id="Task_1" name="Charge" camunda:asyncBefore="true" custom:owner="billing">
  <bpmn:documentation>Charges the card</bpmn:documentation>
  <bpmn:extensionElements>
    <camunda:inputOutput>
      <camunda:inputParameter name="amount">42</camunda:inputParameter>
    </camunda:inputOutput>
    <zeebe:taskDefinition retries="3" type="charge" />
  </bpmn:extensionElements>
  <bpmn:ioSpecification id="IoSpec_1">
    <bpmn:dataInput id="DataInput_1" />
    <bpmn:inputSet id="InputSet_1">
      <bpmn:dataInputRefs>DataInput_1</bpmn:dataInputRefs>
    </bpmn:inputSet>
  </bpmn:ioSpecification>
  <bpmn:multiInstanceLoopCharacteristics id="Loop_1" isSequential="true" />
</bpmn:serviceTask>`,
        );
    });

    it.each([
        ["subProcess", "Sub_1"],
        ["transaction", "Transaction_1"],
        ["adHocSubProcess", "AdHoc_1"],
    ])(
        "leaves the flow elements and lanes out of a %s but keeps its lane sets, data objects and artifacts",
        async (tag, id) => {
            const xml = withProcess(`<bpmn:${tag} id="${id}">
      <bpmn:laneSet id="${id}_LaneSet"><bpmn:lane id="${id}_Lane" /></bpmn:laneSet>
      <bpmn:task id="${id}_Task" />
      <bpmn:dataObject id="${id}_DataObject" />
      <bpmn:textAnnotation id="${id}_Note"><bpmn:text>note</bpmn:text></bpmn:textAnnotation>
    </bpmn:${tag}>`);

            await expect(elementXml(xml, id)).resolves
                .toBe(`<bpmn:${tag} xmlns:bpmn="${BPMN}" id="${id}">
  <bpmn:laneSet id="${id}_LaneSet" />
  <bpmn:dataObject id="${id}_DataObject" />
  <bpmn:textAnnotation id="${id}_Note">
    <bpmn:text>note</bpmn:text>
  </bpmn:textAnnotation>
</bpmn:${tag}>`);
        },
    );

    it("keeps a process's own attributes, extensions, lane sets and artifacts but none of its tracked children", async () => {
        const xml = withProcess(
            `<bpmn:extensionElements><zeebe:properties><zeebe:property name="a" value="b" /></zeebe:properties></bpmn:extensionElements>
    <bpmn:laneSet id="LaneSet_1"><bpmn:lane id="Lane_1" /></bpmn:laneSet>
    <bpmn:task id="Task_1" />
    <bpmn:textAnnotation id="Note_1" />`,
            'camunda:historyTimeToLive="P1D"',
        );

        expectSnippet(
            await elementXml(xml, "Process_1"),
            `<bpmn:process xmlns:bpmn="${BPMN}" xmlns:camunda="${CAMUNDA}" xmlns:zeebe="${ZEEBE}" id="Process_1" isExecutable="true" camunda:historyTimeToLive="P1D">
  <bpmn:extensionElements>
    <zeebe:properties>
      <zeebe:property name="a" value="b" />
    </zeebe:properties>
  </bpmn:extensionElements>
  <bpmn:laneSet id="LaneSet_1" />
  <bpmn:textAnnotation id="Note_1" />
</bpmn:process>`,
        );
    });

    it("leaves participants and message flows out of a collaboration but keeps artifacts and conversations", async () => {
        const xml = definitions(`  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" />
    <bpmn:participant id="Participant_2" />
    <bpmn:messageFlow id="MessageFlow_1" sourceRef="Participant_1" targetRef="Participant_2" />
    <bpmn:textAnnotation id="Note_1" />
    <bpmn:conversation id="Conversation_1" />
    <bpmn:conversationLink id="ConversationLink_1" sourceRef="Participant_1" targetRef="Conversation_1" />
  </bpmn:collaboration>`);

        await expect(elementXml(xml, "Collaboration_1")).resolves
            .toBe(`<bpmn:collaboration xmlns:bpmn="${BPMN}" id="Collaboration_1">
  <bpmn:textAnnotation id="Note_1" />
  <bpmn:conversation id="Conversation_1" />
  <bpmn:conversationLink id="ConversationLink_1" sourceRef="Participant_1" targetRef="Conversation_1" />
</bpmn:collaboration>`);
    });

    it("leaves a lane's child lanes out but keeps its child lane set and flow node references", async () => {
        const xml = withProcess(`<bpmn:laneSet id="LaneSet_1">
      <bpmn:lane id="Lane_1" name="Billing">
        <bpmn:flowNodeRef>Task_1</bpmn:flowNodeRef>
        <bpmn:childLaneSet id="ChildLaneSet_1"><bpmn:lane id="Lane_2" /></bpmn:childLaneSet>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:task id="Task_1" />`);

        await expect(elementXml(xml, "Lane_1")).resolves
            .toBe(`<bpmn:lane xmlns:bpmn="${BPMN}" id="Lane_1" name="Billing">
  <bpmn:flowNodeRef>Task_1</bpmn:flowNodeRef>
  <bpmn:childLaneSet id="ChildLaneSet_1" />
</bpmn:lane>`);
    });

    it("leaves data associations out of activities and events, since each is its own element", async () => {
        const xml =
            withProcess(`<bpmn:dataObjectReference id="DataRef_1" dataObjectRef="DataObject_1" />
    <bpmn:dataObject id="DataObject_1" />
    <bpmn:task id="Task_1">
      <bpmn:dataInputAssociation id="InputAssociation_1"><bpmn:sourceRef>DataRef_1</bpmn:sourceRef></bpmn:dataInputAssociation>
      <bpmn:dataOutputAssociation id="OutputAssociation_1"><bpmn:targetRef>DataRef_1</bpmn:targetRef></bpmn:dataOutputAssociation>
    </bpmn:task>
    <bpmn:startEvent id="Start_1">
      <bpmn:dataOutputAssociation id="OutputAssociation_2"><bpmn:targetRef>DataRef_1</bpmn:targetRef></bpmn:dataOutputAssociation>
    </bpmn:startEvent>
    <bpmn:endEvent id="End_1">
      <bpmn:dataInputAssociation id="InputAssociation_2"><bpmn:sourceRef>DataRef_1</bpmn:sourceRef></bpmn:dataInputAssociation>
    </bpmn:endEvent>`);

        await expect(elementXml(xml, "Task_1")).resolves.toBe(
            `<bpmn:task xmlns:bpmn="${BPMN}" id="Task_1" />`,
        );
        await expect(elementXml(xml, "Start_1")).resolves.toBe(
            `<bpmn:startEvent xmlns:bpmn="${BPMN}" id="Start_1" />`,
        );
        await expect(elementXml(xml, "End_1")).resolves.toBe(
            `<bpmn:endEvent xmlns:bpmn="${BPMN}" id="End_1" />`,
        );
        await expect(elementXml(xml, "InputAssociation_1")).resolves.toContain(
            '<bpmn:dataInputAssociation xmlns:bpmn="' + BPMN + '" id="InputAssociation_1">',
        );
    });

    it("keeps a boundary event's event definitions, which have ids of their own", async () => {
        const xml = withProcess(`<bpmn:task id="Task_1" />
    <bpmn:boundaryEvent id="Boundary_1" attachedToRef="Task_1">
      <bpmn:timerEventDefinition id="Timer_1"><bpmn:timeDuration xsi:type="bpmn:tFormalExpression">PT1H</bpmn:timeDuration></bpmn:timerEventDefinition>
    </bpmn:boundaryEvent>`);

        const snippet = await elementXml(xml, "Boundary_1");

        expect(snippet).toContain('<bpmn:timerEventDefinition id="Timer_1">');
        expect(snippet).toContain(">PT1H</bpmn:timeDuration>");
    });

    it("keeps a sequence flow's condition expression with its xsi:type", async () => {
        const xml = withProcess(`<bpmn:task id="Task_1" />
    <bpmn:task id="Task_2" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Task_1" targetRef="Task_2">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${approved}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>`);

        const snippet = await elementXml(xml, "Flow_1");

        expect(snippet).toMatch(
            /^<bpmn:sequenceFlow [^>]*id="Flow_1" sourceRef="Task_1" targetRef="Task_2">/,
        );
        expect(snippet).toContain('xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"');
        expect(snippet).toContain(
            '<bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">${approved}</bpmn:conditionExpression>',
        );
    });

    it("appends the participant's process after a blank line, without the process's children", async () => {
        const xml = definitions(`  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" name="Billing" processRef="Process_1" />
  </bpmn:collaboration>
  <bpmn:process id="Process_1" isExecutable="true" camunda:historyTimeToLive="P1D">
    <bpmn:task id="Task_1" custom:owner="billing" />
  </bpmn:process>`);

        expectSnippet(
            await elementXml(xml, "Participant_1"),
            `<bpmn:participant xmlns:bpmn="${BPMN}" id="Participant_1" name="Billing" processRef="Process_1" />

<bpmn:process xmlns:bpmn="${BPMN}" xmlns:camunda="${CAMUNDA}" id="Process_1" isExecutable="true" camunda:historyTimeToLive="P1D" />`,
        );
    });

    it("returns only the participant when it references no process", async () => {
        const xml = definitions(`  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" name="Customer" />
  </bpmn:collaboration>`);

        await expect(elementXml(xml, "Participant_1")).resolves.toBe(
            `<bpmn:participant xmlns:bpmn="${BPMN}" id="Participant_1" name="Customer" />`,
        );
    });

    it("declares the namespace of an attribute on a generic extension child", async () => {
        const xml = withProcess(`<bpmn:task id="Task_1">
      <bpmn:extensionElements>
        <zeebe:properties><zeebe:property name="a" value="b" custom:origin="template" /></zeebe:properties>
      </bpmn:extensionElements>
    </bpmn:task>`);

        const snippet = await elementXml(xml, "Task_1");

        expect(snippet).toContain(`xmlns:custom="${CUSTOM}"`);
        expect(snippet).toContain('<zeebe:property custom:origin="template" name="a" value="b" />');
    });

    it("writes the first prefix when two prefixes declare the same namespace", async () => {
        const xml = definitions(
            `  <bpmn:process id="Process_1">
    <bpmn:task id="Task_1" c7:asyncAfter="true" />
  </bpmn:process>`,
            `xmlns:c7="${CAMUNDA}"`,
        );

        expectSnippet(
            await elementXml(xml, "Task_1"),
            `<bpmn:task xmlns:bpmn="${BPMN}" xmlns:camunda="${CAMUNDA}" id="Task_1" camunda:asyncAfter="true" />`,
        );
    });

    it("declares a namespace that an enclosing process declares", async () => {
        const xml = withProcess(
            '<bpmn:task id="Task_1" team:owner="billing" />',
            `xmlns:team="${TEAM}"`,
        );

        expectSnippet(
            await elementXml(xml, "Task_1"),
            `<bpmn:task xmlns:bpmn="${BPMN}" xmlns:team="${TEAM}" id="Task_1" team:owner="billing" />`,
        );
    });

    it("binds an attribute to the namespace its element redeclares for an outer prefix", async () => {
        const xml = withProcess(
            `<bpmn:task id="Task_1" xmlns:custom="${TEAM}" custom:owner="billing" />
    <bpmn:task id="Task_2" custom:owner="shipping" />`,
        );

        // The parser names one namespace by one prefix document-wide, so the redeclared one gets a fresh prefix.
        expectSnippet(
            await elementXml(xml, "Task_1"),
            `<bpmn:task xmlns:bpmn="${BPMN}" xmlns:ns0="${TEAM}" id="Task_1" ns0:owner="billing" />`,
        );
        expectSnippet(
            await elementXml(xml, "Task_2"),
            `<bpmn:task xmlns:bpmn="${BPMN}" xmlns:custom="${CUSTOM}" id="Task_2" custom:owner="shipping" />`,
        );
    });

    it("binds each prefix to its namespace when a later element declares a namespace under a prefix in use", async () => {
        const xml = definitions(`  <bpmn:process id="Process_1" xmlns:ns0="${TEAM}">
    <bpmn:task id="Task_1" xmlns:custom="urn:miragon:other" custom:owner="billing" ns0:region="eu" />
  </bpmn:process>`);

        const snippet = await elementXml(xml, "Task_1");

        expect(snippet).toContain(`xmlns:ns0="${TEAM}"`);
        expect(snippet).toContain('ns0:region="eu"');
        expect(snippet).toMatch(/xmlns:(\w+)="urn:miragon:other"[^>]* \1:owner="billing"/);
    });

    it("declares the namespace of an extension element in a default namespace", async () => {
        const xml = withProcess(`<bpmn:task id="Task_1">
      <bpmn:extensionElements><meta xmlns="${TEAM}" owner="billing" /></bpmn:extensionElements>
    </bpmn:task>`);

        const snippet = await elementXml(xml, "Task_1");

        expect(snippet).toMatch(
            new RegExp(`xmlns:(\\w+)="${TEAM}"[^]*<\\1:meta owner="billing" />`),
        );
    });

    it("declares a namespace that a participant's process declares in the appended process", async () => {
        const xml = definitions(`  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" processRef="Process_1" />
  </bpmn:collaboration>
  <bpmn:process id="Process_1" xmlns:team="${TEAM}" team:owner="billing" />`);

        expect(withSortedDeclarations(await elementXml(xml, "Participant_1"))).toContain(
            `<bpmn:process xmlns:bpmn="${BPMN}" xmlns:team="${TEAM}" id="Process_1" team:owner="billing" />`,
        );
    });

    it.each([
        [
            "a data object",
            (owner: string) =>
                `<bpmn:dataObject id="DataObject_1" custom:owner="${owner}" /><bpmn:task id="Task_1" />`,
        ],
        [
            "a lane set",
            (owner: string) =>
                `<bpmn:laneSet id="LaneSet_1" custom:owner="${owner}"><bpmn:lane id="Lane_1" /></bpmn:laneSet>`,
        ],
    ])(
        "shows a custom attribute change on %s in the participant, which the diff reports as changed",
        async (_label, processContent) => {
            const pool = (owner: string): string =>
                definitions(`  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" processRef="Process_1" />
  </bpmn:collaboration>
  <bpmn:process id="Process_1">
    ${processContent(owner)}
  </bpmn:process>`);
            const before = pool("billing");
            const after = pool("shipping");

            expect((await computeDiff(before, after)).changed).toContain("Participant_1");
            const beforeSnippet = await elementXml(before, "Participant_1");
            const afterSnippet = await elementXml(after, "Participant_1");
            expect(beforeSnippet).toContain('custom:owner="billing"');
            expect(afterSnippet).toContain('custom:owner="shipping"');
            expect(afterSnippet).not.toContain("Task_1");
            expect(afterSnippet).not.toContain("Lane_1");
        },
    );

    it("declares no namespace the element does not use", async () => {
        const xml = withProcess(`<bpmn:task id="Task_1" />
    <bpmn:task id="Task_2" custom:owner="billing" camunda:asyncBefore="true" />`);

        await expect(elementXml(xml, "Task_1")).resolves.toBe(
            `<bpmn:task xmlns:bpmn="${BPMN}" id="Task_1" />`,
        );
    });

    it("writes every attribute without a missing-namespace warning", async () => {
        const runtimeConsole = (
            globalThis as unknown as { console: { warn: (...args: unknown[]) => void } }
        ).console;
        const warn = vi.spyOn(runtimeConsole, "warn").mockImplementation(() => undefined);
        const xml =
            withProcess(`<bpmn:task id="Task_1" custom:owner="billing" camunda:asyncBefore="true">
      <bpmn:extensionElements><zeebe:properties><zeebe:property name="a" custom:origin="template" /></zeebe:properties></bpmn:extensionElements>
    </bpmn:task>`);

        await elementXml(xml, "Task_1");

        expect(warn).not.toHaveBeenCalled();
    });

    it.each([
        ["an unknown id", "Missing_1"],
        ["a diagram interchange id", "Task_1_di"],
        ["a diagram id", "Diagram_1"],
        ["the definitions id", "Definitions_1"],
    ])("returns undefined for %s", async (_label, id) => {
        const xml = withProcess('<bpmn:task id="Task_1" />');

        await expect(elementXml(xml, id)).resolves.toBeUndefined();
    });

    it("rejects on invalid XML", async () => {
        await expect(elementXml("this is not xml", "Task_1")).rejects.toThrow();
    });

    it("rejects, as computeDiff does, when the parser skips content", async () => {
        const xml = withProcess('<bpmn:task id="Task_1" undeclared:owner="billing" />');

        await expect(elementXml(xml, "Task_1")).rejects.toThrow(/unparsable content/i);
    });

    it("writes the declared prefix for a namespace whose name holds an entity", async () => {
        const xml = definitions(
            `  <bpmn:process id="Process_1">
    <bpmn:task id="Task_1" q:k="v" />
  </bpmn:process>`,
            'xmlns:q="urn:a?x=1&amp;y=2"',
        );

        const snippet = await elementXml(xml, "Task_1");

        // The serializer writes namespace names without escaping them, so only the prefix is asserted.
        expect(snippet).toMatch(/^<bpmn:task [^>]*xmlns:q="urn:a\?x=1&/);
        expect(snippet).toContain('id="Task_1" q:k="v" />');
    });

    it("takes no prefix from a declaration in a comment before the root", async () => {
        const xml = withProcess('<bpmn:task id="Task_1" camunda:asyncBefore="true" />').replace(
            "<bpmn:definitions",
            '<!-- xmlns:camunda="urn:wrong" -->\n<bpmn:definitions',
        );

        expectSnippet(
            await elementXml(xml, "Task_1"),
            `<bpmn:task xmlns:bpmn="${BPMN}" xmlns:camunda="${CAMUNDA}" id="Task_1" camunda:asyncBefore="true" />`,
        );
    });

    it("appends a process only to the participant the diff reports its changes under", async () => {
        const xml = definitions(`  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" processRef="Process_1" />
    <bpmn:participant id="Participant_2" processRef="Process_1" />
  </bpmn:collaboration>
  <bpmn:process id="Process_1" />`);

        await expect(elementXml(xml, "Participant_1")).resolves.toContain("<bpmn:process");
        await expect(elementXml(xml, "Participant_2")).resolves.toBe(
            `<bpmn:participant xmlns:bpmn="${BPMN}" id="Participant_2" processRef="Process_1" />`,
        );
    });

    it("returns a message by its id", async () => {
        const xml = definitions(`  <bpmn:message id="Message_1" name="Order placed" />
  <bpmn:process id="Process_1" />`);

        await expect(elementXml(xml, "Message_1")).resolves.toBe(
            `<bpmn:message xmlns:bpmn="${BPMN}" id="Message_1" name="Order placed" />`,
        );
    });
});

describe("elementXml compares two versions of an element", () => {
    const ELEMENT_IDS = [
        "Collaboration_1",
        "Participant_1",
        "MessageFlow_1",
        "Message_1",
        "Process_1",
        "Lane_1",
        "Start_1",
        "Task_1",
        "Flow_1",
        "Sub_1",
        "Sub_1_Task",
    ];

    const ORIGINAL = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="${BPMN}" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:camunda="${CAMUNDA}" xmlns:custom="${CUSTOM}" id="Definitions_1">
  <bpmn:message id="Message_1" name="Order placed" />
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" name="Billing" processRef="Process_1" />
    <bpmn:participant id="Participant_2" name="Customer" />
    <bpmn:messageFlow id="MessageFlow_1" name="Invoice" sourceRef="Task_1" targetRef="Participant_2" messageRef="Message_1" />
  </bpmn:collaboration>
  <bpmn:process id="Process_1" isExecutable="true" camunda:historyTimeToLive="P1D">
    <bpmn:laneSet id="LaneSet_1">
      <bpmn:lane id="Lane_1" name="Clerk">
        <bpmn:flowNodeRef>Start_1</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_1</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="Start_1" name="Start" />
    <bpmn:serviceTask id="Task_1" name="Charge" camunda:asyncBefore="true" custom:owner="billing">
      <bpmn:extensionElements>
        <camunda:inputOutput>
          <camunda:inputParameter name="amount">42</camunda:inputParameter>
        </camunda:inputOutput>
        <camunda:properties>
          <camunda:property name="region" value="eu" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:serviceTask>
    <bpmn:sequenceFlow id="Flow_1" name="go" sourceRef="Start_1" targetRef="Task_1" />
    <bpmn:subProcess id="Sub_1" name="Ship" triggeredByEvent="false">
      <bpmn:task id="Sub_1_Task" name="Pack" />
    </bpmn:subProcess>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Collaboration_1">
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="100" y="100" width="100" height="80" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

    const REFORMATTED = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions id="Definitions_1" xmlns:custom="${CUSTOM}" xmlns:camunda="${CAMUNDA}" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:bpmn="${BPMN}">
<bpmn:message name="Order placed" id="Message_1"/>
<bpmn:collaboration id="Collaboration_1">
<bpmn:participant processRef="Process_1" name="Billing" id="Participant_1"/>
<bpmn:participant name="Customer" id="Participant_2"/>
<bpmn:messageFlow messageRef="Message_1" targetRef="Participant_2" sourceRef="Task_1" name="Invoice" id="MessageFlow_1"/>
</bpmn:collaboration>
<bpmn:process camunda:historyTimeToLive="P1D" isExecutable="true" id="Process_1">
<bpmn:laneSet id="LaneSet_1"><bpmn:lane name="Clerk" id="Lane_1"><bpmn:flowNodeRef>Start_1</bpmn:flowNodeRef><bpmn:flowNodeRef>Task_1</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet>
<bpmn:startEvent name="Start" id="Start_1"/>
<bpmn:serviceTask custom:owner="billing" camunda:asyncBefore="true" name="Charge" id="Task_1"><bpmn:extensionElements><camunda:inputOutput><camunda:inputParameter name="amount">42</camunda:inputParameter></camunda:inputOutput><camunda:properties><camunda:property value="eu" name="region"/></camunda:properties></bpmn:extensionElements></bpmn:serviceTask>
<bpmn:sequenceFlow targetRef="Task_1" sourceRef="Start_1" name="go" id="Flow_1"/>
<bpmn:subProcess triggeredByEvent="false" name="Ship" id="Sub_1"><bpmn:task name="Pack" id="Sub_1_Task"/></bpmn:subProcess>
</bpmn:process>
<bpmndi:BPMNDiagram id="Diagram_1"><bpmndi:BPMNPlane id="Plane_1" bpmnElement="Collaboration_1">
<bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1"><dc:Bounds x="420" y="260" width="120" height="90"/></bpmndi:BPMNShape>
<bpmndi:BPMNShape id="Sub_1_di" bpmnElement="Sub_1" isExpanded="true"><dc:Bounds x="600" y="80" width="350" height="200"/></bpmndi:BPMNShape>
</bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;

    it.each(ELEMENT_IDS)(
        "gives %s the same text when only indentation, attribute order and diagram data differ",
        async (id) => {
            const original = await elementXml(ORIGINAL, id);

            expect(original).toBeDefined();
            await expect(elementXml(REFORMATTED, id)).resolves.toBe(original);
        },
    );

    it.each([
        [
            "an input mapping",
            "Task_1",
            '<camunda:inputParameter name="amount">42</camunda:inputParameter>',
            '<camunda:inputParameter name="amount">43</camunda:inputParameter>',
        ],
        [
            "a listener",
            "Task_1",
            "</camunda:inputOutput>",
            '</camunda:inputOutput><camunda:executionListener class="com.example.Audit" event="start" />',
        ],
        [
            "an unknown namespaced attribute",
            "Task_1",
            'custom:owner="billing"',
            'custom:owner="shipping"',
        ],
        [
            "a condition",
            "Flow_1",
            'targetRef="Task_1" />',
            'targetRef="Task_1"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">${approved}</bpmn:conditionExpression></bpmn:sequenceFlow>',
        ],
        ["a sub-process's own attribute", "Sub_1", 'name="Ship"', 'name="Ship parcels"'],
    ])("shows a changed %s in the text of %s", async (_label, id, before, after) => {
        expect(ORIGINAL).toContain(before);
        const changed = ORIGINAL.replace(before, after);

        const beforeText = await elementXml(ORIGINAL, id);
        const afterText = await elementXml(changed, id);

        expect(afterText).not.toBe(beforeText);
    });

    const declaringZeebeAs = (prefix: string, extraNamespaces = "") =>
        `<bpmn:definitions xmlns:bpmn="${BPMN}" xmlns:${prefix}="${ZEEBE}" ${extraNamespaces} id="Definitions_1">
  <bpmn:process id="Process_1">
    <bpmn:serviceTask id="Task_1">
      <bpmn:extensionElements><${prefix}:taskDefinition type="charge" retries="3" /></bpmn:extensionElements>
    </bpmn:serviceTask>
  </bpmn:process>
</bpmn:definitions>`;

    it("gives the same text when the versions declare a namespace under different prefixes", async () => {
        const before = declaringZeebeAs("zeebe");
        const after = declaringZeebeAs("z");
        const prefixSources = [before, after];

        const beforeText = await elementXml(before, "Task_1", prefixSources);

        expect(beforeText).toContain('<zeebe:taskDefinition retries="3" type="charge" />');
        await expect(elementXml(after, "Task_1", prefixSources)).resolves.toBe(beforeText);
    });

    it("gives a prefix that names another namespace in the other version a fresh one", async () => {
        const before = `<bpmn:definitions xmlns:bpmn="${BPMN}" xmlns:z="${TEAM}" id="Definitions_1">
  <bpmn:process id="Process_1"><bpmn:serviceTask id="Task_1" z:owner="billing" /></bpmn:process>
</bpmn:definitions>`;
        const after = declaringZeebeAs("z");

        const afterText = await elementXml(after, "Task_1", [before, after]);

        expect(afterText).toMatch(
            new RegExp(
                `xmlns:(ns\\d+)="${ZEEBE}"[^]*<\\1:taskDefinition retries="3" type="charge" />`,
            ),
        );
    });

    it("declares the namespaces of a version its prefix sources leave out", async () => {
        const xml = declaringZeebeAs("z");

        await expect(elementXml(xml, "Task_1", [declaringZeebeAs("zeebe")])).resolves.toContain(
            `<zeebe:taskDefinition`,
        );
        await expect(elementXml(xml, "Task_1", [])).resolves.toContain(`<z:taskDefinition`);
    });

    it("keeps a sub-process's text when only a child changes", async () => {
        const changed = ORIGINAL.replace(
            '<bpmn:task id="Sub_1_Task" name="Pack" />',
            '<bpmn:userTask id="Sub_1_Task" name="Pack and label" />',
        );

        expect(changed).not.toBe(ORIGINAL);
        await expect(elementXml(changed, "Sub_1")).resolves.toBe(
            await elementXml(ORIGINAL, "Sub_1"),
        );
    });
});
