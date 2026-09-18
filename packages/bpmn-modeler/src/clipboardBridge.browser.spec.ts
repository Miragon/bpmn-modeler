import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClipboardBridge } from "@miragon/bpmn-modeler-clipboard";

import { createModeler } from "./createModeler";
import type { BpmnModeler } from "./modeler";

/**
 * Two-instance element clipboard through the host bridge: copy in one modeler,
 * paste in another sharing the same {@link ClipboardBridge} — the sandboxed-
 * webview round trip the bridge exists for. The async bridge re-entry only
 * exercises real bpmn-js copy/paste rules, so it runs in the browser project
 * (see docs/adr/engineering-practices.md#test-environments). The wire format
 * stays covered by the jsdom `bridgedClipboard.spec.ts`.
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

interface CopyPasteService {
    copy(elements: unknown[]): unknown;
    paste(context?: { element?: unknown; point?: { x: number; y: number } }): void;
}

interface ElementRegistryService {
    get(id: string): unknown;
    filter(matcher: (element: { type: string }) => boolean): unknown[];
}

const nodes: HTMLElement[] = [];

function mount(): { container: HTMLElement; panel: HTMLElement } {
    const container = document.createElement("div");
    const panel = document.createElement("div");
    container.style.cssText = "position:absolute;width:800px;height:600px";
    document.body.append(container, panel);
    nodes.push(container, panel);
    return { container, panel };
}

function trackDocumentCopyListeners() {
    const originalAdd = document.addEventListener.bind(document);
    const originalRemove = document.removeEventListener.bind(document);
    let added = 0;
    let removed = 0;
    document.addEventListener = ((type: string, ...rest: unknown[]) => {
        if (type === "copy") added++;
        return (originalAdd as (...a: unknown[]) => void)(type, ...rest);
    }) as typeof document.addEventListener;
    document.removeEventListener = ((type: string, ...rest: unknown[]) => {
        if (type === "copy") removed++;
        return (originalRemove as (...a: unknown[]) => void)(type, ...rest);
    }) as typeof document.removeEventListener;
    return {
        counts: () => ({ added, removed }),
        restore: () => {
            document.addEventListener = originalAdd;
            document.removeEventListener = originalRemove;
        },
    };
}

function startEventCount(modeler: BpmnModeler): number {
    return modeler
        .getService<ElementRegistryService>("elementRegistry")
        .filter((element) => element.type === "bpmn:StartEvent").length;
}

afterEach(() => {
    nodes.forEach((node) => node.remove());
    nodes.length = 0;
});

describe("bridged clipboard across two modeler instances", () => {
    it("copies in one instance, pastes in the other, and destroys clean", async () => {
        const tracker = trackDocumentCopyListeners();
        let clipboardText = "";
        const bridge: ClipboardBridge = {
            requestClipboard: () => Promise.resolve(clipboardText),
            writeClipboard: (text) => {
                clipboardText = text;
            },
        };

        const mountA = mount();
        const mountB = mount();
        const modelerA = await createModeler(mountA.container, {
            engine: "c8",
            propertiesPanel: { parent: mountA.panel },
            clipboard: { bridge },
        });
        const modelerB = await createModeler(mountB.container, {
            engine: "c8",
            propertiesPanel: { parent: mountB.panel },
            clipboard: { bridge },
        });
        await modelerA.loadDiagram(XML);
        await modelerB.loadDiagram(XML);

        const registryA = modelerA.getService<ElementRegistryService>("elementRegistry");
        modelerA.getService<CopyPasteService>("copyPaste").copy([registryA.get("StartEvent_1")]);
        expect(clipboardText).toContain("bpmn-js-clip----");

        // `element` + `point` takes diagram-js's non-mouse paste branch; the
        // bridge interceptor re-enters asynchronously with the deserialized tree.
        modelerB.getService<CopyPasteService>("copyPaste").paste({
            element: modelerB.getService("canvas").getRootElement(),
            point: { x: 400, y: 300 },
        });

        await vi.waitFor(() => {
            expect(startEventCount(modelerB)).toBe(2);
        });
        expect(startEventCount(modelerA)).toBe(1);

        modelerA.destroy();
        modelerB.destroy();

        const { added, removed } = tracker.counts();
        tracker.restore();
        expect(added).toBeGreaterThanOrEqual(2);
        expect(removed).toBe(added);
    });
});
