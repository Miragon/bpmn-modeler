import { loadBpmnModdle } from "@miragon/bpmn-modeler-diff";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DiagramIndex } from "./diagramIndex";
import { IndexedDocument } from "./indexedDocument";
import { BUILD_LAYOUT_REPAIRS, repairIntroducedSpots } from "./layoutDrawingRepair";
import { type NodeShape, translatedNode } from "./layoutModel";
import { layoutModelOfDocument } from "./layoutModelReader";
import { PlaneSlots } from "./planeSlots";

const ONE_TASK = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1"><bpmn:task id="Task_A" /></bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_A">
    <bpmndi:BPMNPlane id="Plane_A" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Task_A_di" bpmnElement="Task_A">
        <dc:Bounds x="100" y="100" width="100" height="80" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

describe("repairIntroducedSpots", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("indexes the assembled document once to read and to write the repair", async () => {
        const moddle = (await loadBpmnModdle())();
        const { rootElement } = await moddle.fromXML(ONE_TASK);
        const document = IndexedDocument.of(rootElement);
        const slots = PlaneSlots.ofDocument(document);
        const side = layoutModelOfDocument(document, slots);
        const indexOf = vi.spyOn(DiagramIndex, "of");

        repairIntroducedSpots(
            rootElement,
            [side, side],
            slots,
            {
                ...BUILD_LAYOUT_REPAIRS,
                stackLanes: (layout) => {
                    const shapes = new Map(layout.shapes);
                    shapes.set("Task_A", translatedNode(shapes.get("Task_A") as NodeShape, 40, 0));
                    return { layout: { ...layout, shapes }, stacked: [] };
                },
            },
            [],
            (point) => moddle.create("dc:Point", { x: point.x, y: point.y }),
        );

        expect(indexOf).toHaveBeenCalledTimes(1);
        expect(indexOf.mock.calls[0]?.[0]).toBe(rootElement);
        expect((await moddle.toXML(rootElement)).xml).toContain(
            '<dc:Bounds x="140" y="100" width="100" height="80" />',
        );
    });
});
