import { describe, expect, it } from "vitest";

import { computeDiff } from "./computeDiff";
import { sideView } from "./sideView";
import { MOCK_DIFF_AFTER_XML, MOCK_DIFF_BEFORE_XML } from "./__fixtures__/mock-diff";
import { ALL_EXECUTION_PROPERTY_FIXTURES } from "./__fixtures__/execution-properties";

describe("computeDiff", () => {
    it.each(ALL_EXECUTION_PROPERTY_FIXTURES)("compares $name", async (fixture) => {
        await expect(computeDiff(fixture.before, fixture.after)).resolves.toEqual(fixture.expected);
    });

    it("sorts each of the four categories into their expected ids", async () => {
        const result = await computeDiff(MOCK_DIFF_BEFORE_XML, MOCK_DIFF_AFTER_XML);

        expect(result.added).toContain("Gateway_1");
        expect(result.removed).toContain("UserTask_ToRemove");
        expect(result.changed).toContain("ServiceTask_1");
        expect(result.layoutChanged).toContain("ServiceTask_2");
    });

    it("reports counts matching the category array lengths", async () => {
        const result = await computeDiff(MOCK_DIFF_BEFORE_XML, MOCK_DIFF_AFTER_XML);

        expect(result.counts).toEqual({
            added: result.added.length,
            removed: result.removed.length,
            changed: result.changed.length,
            layoutChanged: result.layoutChanged.length,
        });
    });

    it("orders navigationOrder by sequence-flow position (start → end)", async () => {
        const { navigationOrder } = await computeDiff(MOCK_DIFF_BEFORE_XML, MOCK_DIFF_AFTER_XML);
        const at = (id: string) => navigationOrder.indexOf(id);

        // ServiceTask_1 (changed) is upstream of Gateway_1 (added), which is
        // upstream of ServiceTask_2 (layoutChanged).
        expect(at("ServiceTask_1")).toBeGreaterThanOrEqual(0);
        expect(at("ServiceTask_1")).toBeLessThan(at("Gateway_1"));
        expect(at("Gateway_1")).toBeLessThan(at("ServiceTask_2"));
    });

    it("anchors removed elements next to their surviving neighbour", async () => {
        const { navigationOrder } = await computeDiff(MOCK_DIFF_BEFORE_XML, MOCK_DIFF_AFTER_XML);
        const at = (id: string) => navigationOrder.indexOf(id);

        // UserTask_ToRemove followed ServiceTask_1 in the before diagram, so it
        // anchors right after ServiceTask_1 — ahead of Gateway_1, not dumped
        // at the end.
        expect(at("UserTask_ToRemove")).toBeGreaterThan(at("ServiceTask_1"));
        expect(at("UserTask_ToRemove")).toBeLessThan(at("Gateway_1"));
    });

    it("de-duplicates navigationOrder across categories", async () => {
        const { navigationOrder } = await computeDiff(MOCK_DIFF_BEFORE_XML, MOCK_DIFF_AFTER_XML);

        expect(new Set(navigationOrder).size).toBe(navigationOrder.length);
    });

    it("leaves connections whose only change is layout out of navigationOrder", async () => {
        const result = await computeDiff(flowDiagram({ taskY: 80 }), flowDiagram({ taskY: 200 }));

        expect(result.layoutChanged).toEqual(
            expect.arrayContaining(["Task_1", "Flow_In", "Flow_Out"]),
        );
        expect(result.counts.layoutChanged).toBe(result.layoutChanged.length);
        expect(result.navigationOrder).toContain("Task_1");
        expect(result.navigationOrder).not.toContain("Flow_In");
        expect(result.navigationOrder).not.toContain("Flow_Out");
    });

    it("keeps a connection in navigationOrder when its waypoints and its semantics change", async () => {
        const result = await computeDiff(
            flowDiagram({ taskY: 80 }),
            flowDiagram({ taskY: 200, incomingFlowName: "approved" }),
        );

        expect(result.changed).toContain("Flow_In");
        expect(result.navigationOrder).toContain("Flow_In");
        expect(result.navigationOrder).not.toContain("Flow_Out");
    });

    it("leaves an association whose only change is layout out of navigationOrder", async () => {
        const result = await computeDiff(
            flowDiagram({ taskY: 80, withAnnotation: true }),
            flowDiagram({ taskY: 200, withAnnotation: true }),
        );

        expect(result.layoutChanged).toContain("Association_1");
        expect(result.navigationOrder).not.toContain("Association_1");
    });

    it("returns a value that survives a JSON round-trip unchanged", async () => {
        const result = await computeDiff(MOCK_DIFF_BEFORE_XML, MOCK_DIFF_AFTER_XML);

        expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    });

    it("rejects on invalid XML instead of returning a partial result", async () => {
        await expect(computeDiff("this is not xml", MOCK_DIFF_AFTER_XML)).rejects.toThrow();
    });

    it("rejects when a descriptor failure makes the parser skip XML content", async () => {
        const invalidDescriptorContent = MOCK_DIFF_BEFORE_XML.replace(
            "</bpmn:serviceTask>",
            "<bpmn:extensionElements><camunda:Unknown /></bpmn:extensionElements></bpmn:serviceTask>",
        );

        await expect(computeDiff(invalidDescriptorContent, MOCK_DIFF_AFTER_XML)).rejects.toThrow(
            /unparsable content/i,
        );
    });

    it("reports a changed custom attribute whose prefix a comment declares for an engine namespace", async () => {
        const withOwner = (owner: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!-- xmlns:custom="http://camunda.org/schema/zeebe/1.0" -->
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:custom="urn:miragon:custom" id="Definitions_1">
  <bpmn:process id="Process_1">
    <bpmn:task id="Task_1" custom:owner="${owner}" />
  </bpmn:process>
</bpmn:definitions>`;

        const { changed } = await computeDiff(withOwner("billing"), withOwner("shipping"));

        expect(changed).toContain("Task_1");
    });
});

describe("sideView", () => {
    it("blanks added on the before side and removed on the after side", async () => {
        const result = await computeDiff(MOCK_DIFF_BEFORE_XML, MOCK_DIFF_AFTER_XML);

        const before = sideView(result, "before");
        expect(before.added).toEqual([]);
        expect(before.removed).toEqual(result.removed);

        const after = sideView(result, "after");
        expect(after.added).toEqual(result.added);
        expect(after.removed).toEqual([]);
    });

    it("passes changed and layoutChanged through to both sides", async () => {
        const result = await computeDiff(MOCK_DIFF_BEFORE_XML, MOCK_DIFF_AFTER_XML);

        for (const side of ["before", "after"] as const) {
            const view = sideView(result, side);
            expect(view.changed).toEqual(result.changed);
            expect(view.layoutChanged).toEqual(result.layoutChanged);
        }
    });
});

interface FlowDiagramOptions {
    readonly taskY: number;
    readonly incomingFlowName?: string;
    readonly withAnnotation?: boolean;
}

function flowDiagram({ taskY, incomingFlowName, withAnnotation }: FlowDiagramOptions): string {
    const taskCenterY = taskY + 40;
    const incomingName = incomingFlowName ? ` name="${incomingFlowName}"` : "";
    const annotation = withAnnotation
        ? `<bpmn:textAnnotation id="Annotation_1"><bpmn:text>note</bpmn:text></bpmn:textAnnotation>
    <bpmn:association id="Association_1" sourceRef="Task_1" targetRef="Annotation_1" />`
        : "";
    const annotationDi = withAnnotation
        ? `<bpmndi:BPMNShape id="Annotation_1_di" bpmnElement="Annotation_1">
        <dc:Bounds x="400" y="0" width="100" height="30" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Association_1_di" bpmnElement="Association_1">
        <di:waypoint x="300" y="${taskY}" />
        <di:waypoint x="420" y="30" />
      </bpmndi:BPMNEdge>`
        : "";
    return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  id="Definitions_1"
                  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="Start_1" />
    <bpmn:task id="Task_1" name="Work" />
    <bpmn:endEvent id="End_1" />
    <bpmn:sequenceFlow id="Flow_In" sourceRef="Start_1" targetRef="Task_1"${incomingName} />
    <bpmn:sequenceFlow id="Flow_Out" sourceRef="Task_1" targetRef="End_1" />
    ${annotation}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Start_1_di" bpmnElement="Start_1">
        <dc:Bounds x="100" y="102" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="250" y="${taskY}" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="End_1_di" bpmnElement="End_1">
        <dc:Bounds x="500" y="102" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_In_di" bpmnElement="Flow_In">
        <di:waypoint x="136" y="120" />
        <di:waypoint x="250" y="${taskCenterY}" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_Out_di" bpmnElement="Flow_Out">
        <di:waypoint x="350" y="${taskCenterY}" />
        <di:waypoint x="500" y="120" />
      </bpmndi:BPMNEdge>
      ${annotationDi}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}
