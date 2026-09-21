import { afterEach, describe, expect, it } from "vitest";

import { createModeler } from "./createModeler";
import type { BpmnModeler } from "./modeler";

/**
 * The drilldown fit only reproduces against a real bpmn-js canvas — the fit
 * reads the plane layer's bbox, which jsdom cannot lay out — so it runs here.
 */

const definitions = (
    planeContent: string,
    planeDi: string,
): string => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  id="Definitions_1"
                  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:task id="Top_Task" name="Top task" />
    <bpmn:subProcess id="Main_Subprocess" name="Main subprocess">${planeContent}</bpmn:subProcess>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Top_Diagram">
    <bpmndi:BPMNPlane id="Process_1_plane" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Top_Task_di" bpmnElement="Top_Task">
        <dc:Bounds x="100" y="120" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Main_Subprocess_di" bpmnElement="Main_Subprocess" isExpanded="false">
        <dc:Bounds x="350" y="110" width="120" height="100" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
  <bpmndi:BPMNDiagram id="Main_Diagram">
    <bpmndi:BPMNPlane id="Main_Subprocess_plane" bpmnElement="Main_Subprocess">${planeDi}</bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

// The inner task sits below and right of the 800×600 container at 100% zoom,
// so DrilldownCentering's unvisited-plane default (origin, zoom 1) leaves it
// off-screen — only a fit brings it into view.
const POPULATED_PLANE_XML = definitions(
    `<bpmn:task id="Inner_Task" name="Inner task" />`,
    `<bpmndi:BPMNShape id="Inner_Task_di" bpmnElement="Inner_Task">
        <dc:Bounds x="700" y="898" width="100" height="80" />
      </bpmndi:BPMNShape>`,
);

const EMPTY_PLANE_XML = definitions("", "");

interface CanvasService {
    viewbox(): { x: number; y: number; width: number; height: number; scale: number };
    setRootElement(element: unknown): void;
    getRootElement(): { id: string };
}

interface ElementRegistryService {
    get(id: string): unknown;
}

let modeler: BpmnModeler | undefined;
const nodes: HTMLElement[] = [];

function mount(): { container: HTMLElement; panel: HTMLElement } {
    const container = document.createElement("div");
    const panel = document.createElement("div");
    container.style.cssText = "position:absolute;width:800px;height:600px";
    document.body.append(container, panel);
    nodes.push(container, panel);
    return { container, panel };
}

async function openModeler(xml: string): Promise<BpmnModeler> {
    const { container, panel } = mount();
    modeler = await createModeler(container, {
        engine: "c7",
        propertiesPanel: { parent: panel },
    });
    await modeler.loadDiagram(xml);
    return modeler;
}

function drillInto(handle: BpmnModeler, rootId: string): void {
    const canvas = handle.getService<CanvasService>("canvas");
    const registry = handle.getService<ElementRegistryService>("elementRegistry");
    canvas.setRootElement(registry.get(rootId));
}

function viewboxContains(
    viewbox: { x: number; y: number; width: number; height: number },
    bounds: { x: number; y: number; width: number; height: number },
): boolean {
    return (
        viewbox.x <= bounds.x &&
        viewbox.y <= bounds.y &&
        viewbox.x + viewbox.width >= bounds.x + bounds.width &&
        viewbox.y + viewbox.height >= bounds.y + bounds.height
    );
}

afterEach(() => {
    modeler?.destroy();
    modeler = undefined;
    nodes.forEach((node) => node.remove());
    nodes.length = 0;
});

describe("DrilldownFit against a real canvas", () => {
    it("fits a populated plane on its first drilldown", async () => {
        const handle = await openModeler(POPULATED_PLANE_XML);

        drillInto(handle, "Main_Subprocess_plane");

        const viewbox = handle.getService<CanvasService>("canvas").viewbox();
        expect(viewboxContains(viewbox, { x: 700, y: 898, width: 100, height: 80 })).toBe(true);
        expect(viewbox.scale).toBeLessThanOrEqual(1);
    });

    it("fits the first contentful drilldown after the plane was authored empty", async () => {
        const handle = await openModeler(EMPTY_PLANE_XML);
        const canvas = handle.getService<CanvasService>("canvas");

        drillInto(handle, "Main_Subprocess_plane");

        const planeRoot = handle
            .getService<ElementRegistryService>("elementRegistry")
            .get("Main_Subprocess_plane");
        interface ModelingService {
            createShape(shape: unknown, position: { x: number; y: number }, parent: unknown): void;
        }
        interface ElementFactoryService {
            createShape(attrs: { type: string }): unknown;
        }
        const shape = handle
            .getService<ElementFactoryService>("elementFactory")
            .createShape({ type: "bpmn:Task" });
        handle
            .getService<ModelingService>("modeling")
            .createShape(shape, { x: 1500, y: 1200 }, planeRoot);

        drillInto(handle, "Process_1");
        drillInto(handle, "Main_Subprocess_plane");

        const viewbox = canvas.viewbox();
        expect(viewboxContains(viewbox, { x: 1450, y: 1160, width: 100, height: 80 })).toBe(true);
    });
});
