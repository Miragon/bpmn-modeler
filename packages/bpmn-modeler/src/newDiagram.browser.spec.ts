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
import { START_EVENT_XML } from "./__fixtures__/bpmnXml";
import { mountWithPanel, removeMounts } from "./__fixtures__/surfaceMount";

/**
 * A stamped `newDiagram()` only round-trips through a real bpmn-js
 * import/export, which jsdom cannot lay out — so it runs here.
 */

let modeler: BpmnModeler | undefined;
let designer: BpmnDesigner | undefined;
afterEach(() => {
    modeler?.destroy();
    modeler = undefined;
    designer?.destroy();
    designer = undefined;
    removeMounts();
});

describe("engine-bound newDiagram stamps the execution platform", () => {
    for (const engine of ["c7", "c8"] as Engine[]) {
        it(`makes a fresh ${engine} diagram reopen with the full mode set`, async () => {
            const { container, panel } = mountWithPanel();
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
        const { container, panel } = mountWithPanel();
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
        const { container, panel } = mountWithPanel();
        modeler = await createModeler(container, {
            engine: "c7",
            propertiesPanel: { parent: panel },
        });

        await modeler.loadDiagram(START_EVENT_XML);
        const xml = await modeler.exportDiagram();

        expect(xml).not.toContain("modeler:executionPlatform");
        expect(detectEngine(xml)).toBeUndefined();
    });

    it("keeps the Design-mode designer's newDiagram engine-neutral", async () => {
        const { container, panel } = mountWithPanel();
        designer = await createDesigner(container, { propertiesPanel: { parent: panel } });

        await designer.newDiagram();
        const xml = await designer.exportDiagram();

        expect(xml).not.toContain("modeler:executionPlatform");
    });
});
