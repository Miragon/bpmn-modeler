import { describe, it, expect } from "vitest";

/**
 * Runtime spec for the engine-neutral design surface — currently skipped.
 *
 * Since #1441 the panel is our own inlined fork
 * (`@miragon/bpmn-modeler-properties-panel`, TS source), so the old blocker —
 * upstream `bpmn-js-properties-panel`'s dist tripping Vitest's runner on
 * extensionless deep ESM imports — is gone; the fork's readonly derivation now
 * has a real runtime proof in `libs/properties-panel/src/render/
 * propertiesPanelRenderer.spec.tsx`. Two walls remain here, though. First,
 * `createDesigner` pulls the i18n overlay (`@miragon/bpmn-modeler-i18n-extras`),
 * which the package's Vitest project does not resolve — importing the module
 * poisons collection. Second, even past that, a full bpmn-js Modeler lays out an
 * SVG canvas that jsdom cannot (the same wall `createViewer.spec.ts` documents,
 * ADR 0011), so a rendered-diagram assertion would still throw.
 *
 * The tests dynamic-import inside skipped bodies so they document the intended
 * runtime contract and are ready to un-skip if both walls are ever lifted. The
 * real runtime proof lives in the demo page `apps/demo-webapp/bpmn/design.html`
 * (the epic's acceptance check) and the type-level conformance in
 * `publicApi.spec.ts`.
 */
describe.skip("createDesigner (runtime, jsdom — blocked by the i18n-extras resolution + SVG-layout walls)", () => {
    it("exposes the editable core services (inverse of the viewer's readonly proof)", async () => {
        const { createDesigner } = await import("./createDesigner");
        const container = document.createElement("div");
        const panel = document.createElement("div");
        document.body.append(container, panel);

        const designer = await createDesigner(container, { propertiesPanel: { parent: panel } });

        // Editable: the modelling services a viewer never registers ARE present.
        expect(designer.getService("modeling")).toBeDefined();
        expect(designer.getService("commandStack")).toBeDefined();
        // Engine-neutral: none of the Camunda services are registered.
        expect(() => designer.getService("elementTemplates")).toThrow();
        expect(() => designer.getService("transactionBoundaries")).toThrow();
        // The panel renders under the supplied parent.
        expect(panel.querySelector(".bio-properties-panel")).not.toBeNull();

        designer.destroy();
    });

    it("creates a new diagram and exports XML with no execution platform", async () => {
        const { createDesigner } = await import("./createDesigner");
        const container = document.createElement("div");
        const panel = document.createElement("div");
        document.body.append(container, panel);

        const designer = await createDesigner(container, { propertiesPanel: { parent: panel } });
        await designer.newDiagram();
        const xml = await designer.exportDiagram();
        // The mode marker: a fresh Design diagram carries no execution platform.
        expect(xml).not.toContain("modeler:executionPlatform");

        designer.destroy();
    });
});
