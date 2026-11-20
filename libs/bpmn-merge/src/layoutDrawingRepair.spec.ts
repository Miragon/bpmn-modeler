import { loadBpmnModdle } from "@miragon/bpmn-modeler-diff";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GROUP_AROUND_PUSHED_CHAIN } from "./__fixtures__/groupAroundPushedChain";
import { layoutModelOf } from "./__fixtures__/layoutModelOf";
import { DiagramIndex } from "./diagramIndex";
import { IndexedDocument } from "./indexedDocument";
import { BUILD_LAYOUT_REPAIRS, repairIntroducedSpots } from "./layoutDrawingRepair";
import { type LayoutModel, type NodeShape, translatedNode } from "./layoutModel";
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

describe("repairIntroducedSpots with a group", () => {
    const without = (layout: LayoutModel, id: string): LayoutModel => {
        const shapes = new Map(layout.shapes);
        shapes.delete(id);
        return { shapes, edges: layout.edges };
    };

    it("shifts the group with the task and end event it encloses when making room pushes both", async () => {
        const moddle = (await loadBpmnModdle())();
        const { rootElement } = await moddle.fromXML(GROUP_AROUND_PUSHED_CHAIN);
        const document = IndexedDocument.of(rootElement);
        const slots = PlaneSlots.ofDocument(document);
        const assembled = layoutModelOfDocument(document, slots);
        const sides = [without(assembled, "Task_Y"), without(assembled, "Task_X")];

        repairIntroducedSpots(rootElement, sides, slots, BUILD_LAYOUT_REPAIRS, [], (point) =>
            moddle.create("dc:Point", { x: point.x, y: point.y }),
        );
        const repaired = layoutModelOf(rootElement);

        expect(repaired.shapes.get("Task_K")!.bounds).toEqual(box(960, 140, 100, 80));
        expect(repaired.shapes.get("End_K")!.bounds).toEqual(box(1112, 162, 36, 36));
        expect(repaired.shapes.get("Group_K")!.bounds).toEqual(box(940, 110, 230, 140));
    });
});

function box(x: number, y: number, width: number, height: number) {
    return { x, y, width, height };
}
