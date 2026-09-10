import { afterEach, describe, expect, it } from "vitest";

import { DiffViewer } from "./DiffViewer";

/**
 * The diff pane's latch only matters against a real canvas: a `setViewport`
 * sync arriving before the first ResizeObserver delivery must survive the
 * pending initial fit, and a sync onto an unsized pane must apply once laid out.
 */

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:task id="Task_1" name="A" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="5100" y="3980" width="100" height="80" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

const SYNC = { x: 5000, y: 3900, width: 640, height: 480 };

const raf = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

async function settleObserver(): Promise<void> {
    for (let i = 0; i < 6; i++) {
        await raf();
    }
}

let diff: DiffViewer | undefined;
let container: HTMLElement | undefined;

function mount(width: number, height: number): HTMLElement {
    const el = document.createElement("div");
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    el.style.position = "absolute";
    document.body.appendChild(el);
    return el;
}

afterEach(() => {
    diff?.destroy();
    diff = undefined;
    container?.remove();
    container = undefined;
});

describe("DiffViewer initial-viewport latch (real ResizeObserver)", () => {
    it("keeps a setViewport sync across the delayed initial fit", async () => {
        container = mount(800, 600);
        diff = new DiffViewer(container);
        await diff.importXML(XML);

        diff.setViewport(SYNC);
        await settleObserver();

        const viewport = diff.getViewport();
        expect(viewport.x).toBeCloseTo(SYNC.x, 0);
        expect(viewport.y).toBeCloseTo(SYNC.y, 0);
    });

    it("applies a sync onto an unsized pane once it is laid out", async () => {
        container = mount(0, 0);
        diff = new DiffViewer(container);
        await diff.importXML(XML);

        diff.setViewport(SYNC);
        await settleObserver();

        container.style.width = "800px";
        container.style.height = "600px";
        await settleObserver();

        const viewport = diff.getViewport();
        expect(viewport.x).toBeCloseTo(SYNC.x, 0);
        expect(viewport.y).toBeCloseTo(SYNC.y, 0);
    });
});
