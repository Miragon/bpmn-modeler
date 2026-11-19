import { loadBpmnModdle } from "@miragon/bpmn-modeler-diff";
import { describe, expect, it } from "vitest";

import { type LayoutModel, type NodeShape, translatedNode } from "./layoutModel";
import { layoutModelOf } from "./layoutModelReader";
import { writeLayoutChanges } from "./layoutRepairWriter";

const edge = (id: string, y: number) => `
      <bpmndi:BPMNEdge id="${id}" bpmnElement="Flow_1">
        <di:waypoint x="200" y="${y}" />
        <di:waypoint x="300" y="${y}" />
      </bpmndi:BPMNEdge>`;

const TWO_PLANES = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1">
    <bpmn:task id="Task_A" />
    <bpmn:task id="Task_B" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Task_A" targetRef="Task_B" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_First">
    <bpmndi:BPMNPlane id="Plane_First" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Task_A_di" bpmnElement="Task_A">
        <dc:Bounds x="100" y="100" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_B_di" bpmnElement="Task_B">
        <dc:Bounds x="300" y="100" width="100" height="80" />
      </bpmndi:BPMNShape>${edge("Flow_1_first", 140)}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
  <bpmndi:BPMNDiagram id="Diagram_Second">
    <bpmndi:BPMNPlane id="Plane_Second" bpmnElement="Process_1">${edge("Flow_1_second", 150)}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

const LABELLED_EVENT = TWO_PLANES.replace(
    '<bpmn:task id="Task_B" />',
    '<bpmn:task id="Task_B" /><bpmn:endEvent id="End_1" />',
).replace(
    '<bpmndi:BPMNEdge id="Flow_1_first"',
    `<bpmndi:BPMNShape id="End_1_di" bpmnElement="End_1">
        <dc:Bounds x="500" y="122" width="36" height="36" />
        <bpmndi:BPMNLabel><dc:Bounds x="490" y="165" width="56" height="14" /></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_first"`,
);

async function writtenWith(xml: string, change: (layout: LayoutModel) => LayoutModel) {
    const moddle = (await loadBpmnModdle())();
    const { rootElement } = await moddle.fromXML(xml);
    const before = layoutModelOf(rootElement);
    writeLayoutChanges(rootElement, before, change(before), (point) =>
        moddle.create("dc:Point", { x: point.x, y: point.y }),
    );
    return { layout: layoutModelOf(rootElement), xml: (await moddle.toXML(rootElement)).xml };
}

describe("writeLayoutChanges", () => {
    it("writes a flow drawn on two planes into the drawing the layout reads", async () => {
        const waypoints = [
            { x: 200, y: 130 },
            { x: 300, y: 130 },
        ];

        const written = await writtenWith(TWO_PLANES, (layout) => ({
            ...layout,
            edges: new Map([["Flow_1", { ...layout.edges.get("Flow_1")!, waypoints }]]),
        }));

        expect(written.layout.edges.get("Flow_1")?.waypoints).toEqual(waypoints);
        expect(written.xml).toContain('<di:waypoint x="200" y="150" />');
    });

    it("moves a shape's label with it and grows a shape in place", async () => {
        const written = await writtenWith(LABELLED_EVENT, (layout) => {
            const shapes = new Map(layout.shapes);
            const end = layout.shapes.get("End_1") as NodeShape;
            const task = layout.shapes.get("Task_A")!;
            shapes.set("End_1", translatedNode(end, 40, -20));
            shapes.set("Task_A", { ...task, bounds: { ...task.bounds, width: 160 } });
            return { ...layout, shapes };
        });

        expect(written.xml).toContain('<dc:Bounds x="540" y="102" width="36" height="36" />');
        expect(written.xml).toContain('<dc:Bounds x="530" y="145" width="56" height="14" />');
        expect(written.xml).toContain('<dc:Bounds x="100" y="100" width="160" height="80" />');
    });

    it("writes a shape's label where the repaired layout puts it, apart from its bounds", async () => {
        const written = await writtenWith(LABELLED_EVENT, (layout) => {
            const shapes = new Map(layout.shapes);
            const end = layout.shapes.get("End_1") as NodeShape;
            const task = layout.shapes.get("Task_B") as NodeShape;
            shapes.set("End_1", { ...end, label: { ...end.label!, x: 470, y: 180 } });
            shapes.set("Task_B", translatedNode(task, 0, 60));
            return { ...layout, shapes };
        });

        expect(written.xml).toContain('<dc:Bounds x="500" y="122" width="36" height="36" />');
        expect(written.xml).toContain('<dc:Bounds x="470" y="180" width="56" height="14" />');
        expect(written.xml).toContain('<dc:Bounds x="300" y="160" width="100" height="80" />');
    });

    it("keeps a shape's label in place when the repaired layout keeps it there", async () => {
        const written = await writtenWith(LABELLED_EVENT, (layout) => {
            const shapes = new Map(layout.shapes);
            const end = layout.shapes.get("End_1") as NodeShape;
            shapes.set("End_1", { ...translatedNode(end, 40, 0), label: end.label });
            return { ...layout, shapes };
        });

        expect(written.xml).toContain('<dc:Bounds x="540" y="122" width="36" height="36" />');
        expect(written.xml).toContain('<dc:Bounds x="490" y="165" width="56" height="14" />');
    });

    it("leaves the file alone when nothing changed", async () => {
        const moddle = (await loadBpmnModdle())();
        const original = (await moddle.toXML((await moddle.fromXML(LABELLED_EVENT)).rootElement))
            .xml;

        expect((await writtenWith(LABELLED_EVENT, (layout) => layout)).xml).toBe(original);
    });
});
