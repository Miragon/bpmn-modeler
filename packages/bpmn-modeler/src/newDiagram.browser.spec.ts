import {
    defaultMode,
    detectEngine,
    getLatestVersion,
    isModeAvailable,
    type Engine,
} from "@miragon/bpmn-modeler-types";
import { afterEach, describe, expect, it } from "vitest";

import { createModeler } from "./createModeler";
import { createDesigner } from "./design/createDesigner";
import type { BpmnModeler } from "./modeler";
import type { BpmnDesigner } from "./design/designer";

/**
 * A stamped `newDiagram()` only round-trips through a real bpmn-js
 * import/export, which jsdom cannot lay out — so it runs here.
 */

const UNTAGGED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
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

let modeler: BpmnModeler | undefined;
let designer: BpmnDesigner | undefined;
const nodes: HTMLElement[] = [];

function mount(): { container: HTMLElement; panel: HTMLElement } {
    const container = document.createElement("div");
    const panel = document.createElement("div");
    container.style.cssText = "position:absolute;width:800px;height:600px";
    document.body.append(container, panel);
    nodes.push(container, panel);
    return { container, panel };
}

afterEach(() => {
    modeler?.destroy();
    modeler = undefined;
    designer?.destroy();
    designer = undefined;
    nodes.forEach((node) => node.remove());
    nodes.length = 0;
});

describe("engine-bound newDiagram stamps the execution platform", () => {
    for (const engine of ["c7", "c8"] as Engine[]) {
        it(`makes a fresh ${engine} diagram reopen with the full mode set`, async () => {
            const { container, panel } = mount();
            modeler = await createModeler(container, {
                engine,
                propertiesPanel: { parent: panel },
            });

            await modeler.newDiagram();
            const xml = await modeler.exportDiagram();
            const detected = detectEngine(xml);

            expect(detected).toBe(engine);
            expect(xml).toContain(`modeler:executionPlatformVersion="${getLatestVersion(engine)}"`);
            expect(defaultMode(detected)).toBe("implement");
            expect(isModeAvailable("implement", detected)).toBe(true);
        });
    }

    it("stamps an explicit engineVersion verbatim", async () => {
        const { container, panel } = mount();
        modeler = await createModeler(container, {
            engine: "c8",
            engineVersion: "8.5.0",
            propertiesPanel: { parent: panel },
        });

        await modeler.newDiagram();
        const xml = await modeler.exportDiagram();

        expect(xml).toContain('modeler:executionPlatformVersion="8.5.0"');
    });

    it("never stamps a loaded untagged diagram", async () => {
        const { container, panel } = mount();
        modeler = await createModeler(container, {
            engine: "c7",
            propertiesPanel: { parent: panel },
        });

        await modeler.loadDiagram(UNTAGGED_XML);
        const xml = await modeler.exportDiagram();

        expect(xml).not.toContain("modeler:executionPlatform");
        expect(detectEngine(xml)).toBeUndefined();
    });

    it("keeps the Design-mode designer's newDiagram engine-neutral", async () => {
        const { container, panel } = mount();
        designer = await createDesigner(container, { propertiesPanel: { parent: panel } });

        await designer.newDiagram();
        const xml = await designer.exportDiagram();

        expect(xml).not.toContain("modeler:executionPlatform");
    });
});
