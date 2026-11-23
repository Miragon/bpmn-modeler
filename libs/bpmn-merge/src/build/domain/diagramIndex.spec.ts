import { describe, expect, it } from "vitest";

import { parseWithoutWarnings } from "../../__fixtures__/parseWithoutWarnings";
import { DiagramIndex } from "./diagramIndex";

const bounds = `<dc:Bounds x="0" y="0" width="100" height="80" />`;

const document = (rootDrawings: string) => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1">
    <bpmn:task id="Task_A" />
    <bpmn:task id="Task_B" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Task_A" targetRef="Task_B" />
    <bpmn:subProcess id="Sub_1">
      <bpmn:task id="Task_In" />
    </bpmn:subProcess>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_Process">
    <bpmndi:BPMNPlane id="Plane_Process" bpmnElement="Process_1">${rootDrawings}
      <bpmndi:BPMNShape id="Task_B_di" bpmnElement="Task_B">${bounds}</bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1"><di:waypoint x="100" y="40" /><di:waypoint x="200" y="40" /></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
  <bpmndi:BPMNDiagram id="Diagram_Sub">
    <bpmndi:BPMNPlane id="Plane_Sub" bpmnElement="Sub_1">
      <bpmndi:BPMNShape id="Task_In_di" bpmnElement="Task_In">${bounds}</bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

const COLLAPSED_WITHOUT_BOUNDS = `
      <bpmndi:BPMNShape id="Sub_1_unbounded" bpmnElement="Sub_1" />`;
const EXPANDED_WITHOUT_BOUNDS = `
      <bpmndi:BPMNShape id="Sub_1_unbounded" bpmnElement="Sub_1" isExpanded="true" />`;
const EXPANDED = `
      <bpmndi:BPMNShape id="Sub_1_expanded" bpmnElement="Sub_1" isExpanded="true">${bounds}</bpmndi:BPMNShape>`;
const COLLAPSED = `
      <bpmndi:BPMNShape id="Sub_1_collapsed" bpmnElement="Sub_1">${bounds}</bpmndi:BPMNShape>`;
const FLOW_EARLIER = `
      <bpmndi:BPMNEdge id="Flow_1_earlier" bpmnElement="Flow_1"><di:waypoint x="100" y="60" /><di:waypoint x="200" y="60" /></bpmndi:BPMNEdge>`;
const TASK_IN_ON_ROOT = `
      <bpmndi:BPMNShape id="Task_In_root" bpmnElement="Task_In">${bounds}</bpmndi:BPMNShape>`;
const UNNAMED = `
      <bpmndi:BPMNShape id="Unnamed_1">${bounds}</bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Unnamed_2">${bounds}</bpmndi:BPMNShape>`;

async function indexOf(rootDrawings: string) {
    return DiagramIndex.of((await parseWithoutWarnings(document(rootDrawings))).rootElement);
}

describe("shapeDrawingOf", () => {
    it.each([
        ["the first drawing with bounds", COLLAPSED_WITHOUT_BOUNDS + EXPANDED, "Sub_1_expanded"],
        ["the first of two drawings with bounds", COLLAPSED + EXPANDED, "Sub_1_collapsed"],
        ["none when no drawing has bounds", COLLAPSED_WITHOUT_BOUNDS, undefined],
    ])("answers %s", async (_case, rootDrawings, drawingId) => {
        const index = await indexOf(rootDrawings);

        expect(index.shapeDrawingOf("Sub_1")?.element.id).toBe(drawingId);
    });

    it("answers none for an element drawn by an edge", async () => {
        const index = await indexOf(EXPANDED);

        expect(index.shapeDrawingOf("Flow_1")).toBeUndefined();
    });

    it("answers none for an element the index does not draw", async () => {
        const index = await indexOf(EXPANDED);

        expect(index.shapeDrawingOf("Task_A")).toBeUndefined();
    });
});

describe("placedShapeOf", () => {
    it.each([
        ["the shape the layout reads", COLLAPSED_WITHOUT_BOUNDS + EXPANDED, "Sub_1_expanded"],
        ["the first shape when none has bounds", EXPANDED_WITHOUT_BOUNDS, "Sub_1_unbounded"],
    ])("answers %s", async (_case, rootDrawings, drawingId) => {
        const index = await indexOf(rootDrawings);

        expect(index.placedShapeOf("Sub_1")?.element.id).toBe(drawingId);
    });

    it("answers none for an element drawn by an edge", async () => {
        const index = await indexOf(EXPANDED);

        expect(index.placedShapeOf("Flow_1")).toBeUndefined();
    });
});

describe("placedDrawingsOf", () => {
    it.each([
        ["past a first drawing without bounds", COLLAPSED_WITHOUT_BOUNDS + EXPANDED],
        ["before a later drawing without bounds", EXPANDED + COLLAPSED_WITHOUT_BOUNDS],
    ])("places only the shape the layout reads, %s", async (_case, rootDrawings) => {
        const index = await indexOf(rootDrawings);

        expect(index.placedDrawingsOf("Sub_1").map(({ element }) => element.id)).toEqual([
            "Sub_1_expanded",
        ]);
    });

    it("places only the edge the layout reads of a flow drawn twice", async () => {
        const index = await indexOf(EXPANDED + FLOW_EARLIER);

        expect(index.placedDrawingsOf("Flow_1").map(({ element }) => element.id)).toEqual([
            "Flow_1_earlier",
        ]);
    });

    it("places every drawing that names no element", async () => {
        const index = await indexOf(EXPANDED + UNNAMED);

        expect(index.placedDrawingsOf("").map(({ element }) => element.id)).toEqual([
            "Unnamed_1",
            "Unnamed_2",
        ]);
    });

    it("places nothing for an element the index does not draw", async () => {
        const index = await indexOf(EXPANDED);

        expect(index.placedDrawingsOf("Task_A")).toEqual([]);
    });
});

describe("subProcessContentsPlane", () => {
    it.each([
        ["its own plane under a collapsed shape", COLLAPSED, "Sub_1"],
        ["the plane its expanded shape lies on", EXPANDED, "Process_1"],
        [
            "the plane of the shape the layout reads, past a first drawing without bounds",
            COLLAPSED_WITHOUT_BOUNDS + EXPANDED,
            "Process_1",
        ],
        ["its own plane under a collapsed shape without bounds", COLLAPSED_WITHOUT_BOUNDS, "Sub_1"],
        [
            "the plane its expanded shape without bounds lies on",
            EXPANDED_WITHOUT_BOUNDS,
            "Process_1",
        ],
    ])("puts a sub-process's contents on %s", async (_case, rootDrawings, planeOwner) => {
        const index = await indexOf(rootDrawings);

        expect(index.subProcessContentsPlane("Sub_1")).toBe(planeOwner);
    });
});

describe("drawnIds", () => {
    it('lists each id with drawings once, in the order first drawn, with "" for drawings that name no element', async () => {
        const index = await indexOf(COLLAPSED + UNNAMED + EXPANDED);

        expect(index.drawnIds()).toEqual(["Sub_1", "", "Task_B", "Flow_1", "Task_In"]);
    });
});

describe("drawnElements", () => {
    it("lists the drawn elements without the drawings that name none", async () => {
        const index = await indexOf(UNNAMED + COLLAPSED);

        expect(index.drawnElements()).toEqual(["Sub_1", "Task_B", "Flow_1", "Task_In"]);
    });
});

describe("elementsDrawnMoreThanOnce", () => {
    it.each([
        ["a sub-process with two shapes", COLLAPSED + EXPANDED, ["Sub_1"]],
        ["a flow with two edges", EXPANDED + FLOW_EARLIER, ["Flow_1"]],
        ["an element on two planes", EXPANDED + TASK_IN_ON_ROOT, ["Task_In"]],
        ["none for two drawings that name no element", EXPANDED + UNNAMED, []],
    ])("answers %s", async (_case, rootDrawings, elements) => {
        const index = await indexOf(rootDrawings);

        expect(index.elementsDrawnMoreThanOnce()).toEqual(elements);
    });
});

describe("draws", () => {
    it.each([
        ["an element drawn by a shape", "Task_B", true],
        ["an element drawn by an edge", "Flow_1", true],
        ["an element drawn only by a plane", "Process_1", false],
        ["an element without a drawing", "Task_A", false],
    ])("answers %s", async (_case, element, drawn) => {
        const index = await indexOf(EXPANDED);

        expect(index.draws(element)).toBe(drawn);
    });
});

describe("drawingsOf", () => {
    it("answers every drawing of the element in diagram order", async () => {
        const index = await indexOf(COLLAPSED + EXPANDED);

        expect(index.drawingsOf("Sub_1").map(({ element }) => element.id)).toEqual([
            "Sub_1_collapsed",
            "Sub_1_expanded",
        ]);
    });

    it("answers none for an element the index does not draw", async () => {
        const index = await indexOf(EXPANDED);

        expect(index.drawingsOf("Task_A")).toEqual([]);
    });
});

describe("planeOf", () => {
    it.each([
        ["the root plane", EXPANDED, "Task_B", "Process_1"],
        ["a sub-process's plane", EXPANDED, "Task_In", "Sub_1"],
        ["the plane of its first drawing", EXPANDED + TASK_IN_ON_ROOT, "Task_In", "Process_1"],
        ["none for an element without a drawing", EXPANDED, "Task_A", undefined],
    ])("answers %s", async (_case, rootDrawings, element, planeOwner) => {
        const index = await indexOf(rootDrawings);

        expect(index.planeOf(element)).toBe(planeOwner);
    });
});

describe("hasSubProcessPlane", () => {
    it.each([
        ["a sub-process's plane", "Sub_1", true],
        ["a process's plane", "Process_1", false],
        ["an owner without a plane", "Task_B", false],
    ])("answers %s", async (_case, planeOwner, subProcessPlane) => {
        const index = await indexOf(EXPANDED);

        expect(index.hasSubProcessPlane(planeOwner)).toBe(subProcessPlane);
    });
});

const SECOND_PROCESS_DIAGRAM = `
  <bpmndi:BPMNDiagram id="Diagram_Process_Again">
    <bpmndi:BPMNPlane id="Plane_Process_Again" bpmnElement="Process_1" />
  </bpmndi:BPMNDiagram>`;

async function indexWithSecondProcessDiagram() {
    const xml = document(EXPANDED).replace(
        "</bpmn:definitions>",
        `${SECOND_PROCESS_DIAGRAM}\n</bpmn:definitions>`,
    );
    return DiagramIndex.of((await parseWithoutWarnings(xml)).rootElement);
}

describe("diagramOf", () => {
    it.each([
        [
            "the first in document order of an owner with two diagrams",
            "Process_1",
            "Diagram_Process",
        ],
        ["a sub-process's diagram", "Sub_1", "Diagram_Sub"],
        ["none for an owner without a diagram", "Task_B", undefined],
    ])("answers %s", async (_case, planeOwner, diagramId) => {
        const index = await indexWithSecondProcessDiagram();

        expect(index.diagramOf(planeOwner)?.id).toBe(diagramId);
    });
});

describe("planeOwnersInDocumentOrder", () => {
    it("lists each plane owner once, in the order of its first diagram", async () => {
        const index = await indexWithSecondProcessDiagram();

        expect(index.planeOwnersInDocumentOrder()).toEqual(["Process_1", "Sub_1"]);
    });
});
