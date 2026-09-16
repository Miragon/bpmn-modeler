import { afterEach, describe, expect, it } from "vitest";

import { createViewer } from "./createViewer";
import type { BpmnViewer } from "./viewer";

/**
 * The viewer's rendered round trip — load, select, export XML/SVG. Render-
 * dependent (bpmn-js's viewbox transform needs real SVG layout), so it runs in
 * the browser project (ADR 0032); jsdom coverage of the same factory stays in
 * `createViewer.spec.ts`. Kept separate from `viewState.browser.spec.ts`,
 * which covers view-state restore, a different concern.
 */

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="173" y="102" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

let viewer: BpmnViewer | undefined;
const nodes: HTMLElement[] = [];

function mount(): HTMLElement {
    const container = document.createElement("div");
    container.style.cssText = "position:absolute;width:800px;height:600px";
    document.body.appendChild(container);
    nodes.push(container);
    return container;
}

afterEach(() => {
    viewer?.destroy();
    viewer = undefined;
    nodes.forEach((node) => node.remove());
    nodes.length = 0;
});

describe("createViewer (rendered round trip)", () => {
    it("loads a diagram, selects an element, and round-trips XML/SVG", async () => {
        viewer = await createViewer(mount());

        const result = await viewer.loadDiagram(XML);
        expect(result.warnings).toEqual([]);

        const changes: string[][] = [];
        viewer.selection.onSelectionChanged((ids) => changes.push(ids));
        viewer.selection.selectElementsByIds(["StartEvent_1"]);
        expect(viewer.selection.getSelectedElementIds()).toEqual(["StartEvent_1"]);
        expect(changes.at(-1)).toEqual(["StartEvent_1"]);

        expect(await viewer.exportDiagram()).toContain("StartEvent_1");
        expect(await viewer.getDiagramSvg()).toContain("<svg");
    });
});
