import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClipboardBridge } from "@miragon/bpmn-modeler-clipboard";

import { createDesigner } from "./createDesigner";
import type { BpmnDesigner } from "./designer";
import { START_EVENT_XML } from "../__fixtures__/bpmnXml";
import { mountWithPanel, removeMounts, trackDocumentListeners } from "../__fixtures__/surfaceMount";

const CALL_ACTIVITY_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:callActivity id="Call_1" calledElement="Invoice_Process" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Call_1_di" bpmnElement="Call_1">
        <dc:Bounds x="200" y="100" width="100" height="80" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

interface ContextPadService {
    getEntries(
        element: unknown,
    ): Record<string, { action: { click(event: Event, element: unknown): void } }>;
}

interface CopyPasteService {
    copy(elements: unknown[]): unknown;
}

/**
 * The designer's runtime contract — editable services present, Camunda
 * services absent, panel rendered, host ports and clipboard bridge wired.
 * Needs a real bpmn-js instance;
 * the factory's failure paths stay covered by the jsdom
 * `createDesigner.spec.ts`.
 */

let designer: BpmnDesigner | undefined;
afterEach(() => {
    designer?.destroy();
    designer = undefined;
    removeMounts();
});

describe("createDesigner (runtime contract)", () => {
    it("exposes the editable core services (inverse of the viewer's readonly proof)", async () => {
        const { container, panel } = mountWithPanel();
        designer = await createDesigner(container, { propertiesPanel: { parent: panel } });
        // The panel attaches on import, so give it a diagram to render against.
        await designer.newDiagram();

        // Editable: the modelling services a viewer never registers ARE present.
        expect(designer.getService("modeling")).toBeDefined();
        expect(designer.getService("commandStack")).toBeDefined();
        // Engine-neutral: none of the Camunda services are registered.
        expect(() => designer!.getService("elementTemplates")).toThrow();
        expect(() => designer!.getService("transactionBoundaries")).toThrow();
        // The panel renders under the supplied parent.
        expect(panel.querySelector(".bio-properties-panel")).not.toBeNull();

        designer.destroy();
        designer = undefined;
    });

    it("offers model navigation for a call activity when the host supplies the port", async () => {
        const openReference = vi.fn();
        const { container, panel } = mountWithPanel();
        designer = await createDesigner(container, {
            propertiesPanel: { parent: panel },
            linting: false,
            capabilities: { modelNavigation: { openReference } },
        });
        await designer.loadDiagram(CALL_ACTIVITY_XML);
        const callActivity = designer.getService("elementRegistry").get("Call_1");

        const entries = designer
            .getService<ContextPadService>("contextPad")
            .getEntries(callActivity);
        entries["navigate-to-referenced-model"].action.click(new MouseEvent("click"), callActivity);

        expect(openReference).toHaveBeenCalledExactlyOnceWith({
            id: "Invoice_Process",
            kind: "process",
        });
    });

    it("copies through a host clipboard bridge and releases its document listeners", async () => {
        const tracker = trackDocumentListeners("copy");
        let clipboardText = "";
        const bridge: ClipboardBridge = {
            requestClipboard: () => Promise.resolve(clipboardText),
            writeClipboard: (text) => {
                clipboardText = text;
            },
        };
        const { container, panel } = mountWithPanel();
        designer = await createDesigner(container, {
            propertiesPanel: { parent: panel },
            linting: false,
            clipboard: { bridge },
        });
        await designer.loadDiagram(START_EVENT_XML);

        const startEvent = designer.getService("elementRegistry").get("StartEvent_1");
        designer.getService<CopyPasteService>("copyPaste").copy([startEvent]);
        expect(clipboardText).toContain("bpmn-js-clip----");

        designer.destroy();
        designer = undefined;
        const { added, removed } = tracker.counts();
        tracker.restore();
        expect(added).toBeGreaterThan(0);
        expect(removed).toBe(added);
    });
});
