import { describe, it, expect } from "vitest";

/**
 * Runtime spec for the engine-neutral design surface — currently skipped.
 *
 * Unlike the readonly viewer (whose NavigatedViewer stands up in jsdom, so
 * `createViewer.spec.ts` runs for real), the design surface mounts the
 * engine-neutral **properties panel** (`bpmn-js-properties-panel`). That package
 * reaches into bpmn-js internals through extensionless ESM imports
 * (`label-editing → ../../util/LabelUtil`) that Vitest's module runner resolves
 * with Node's native ESM loader — which rejects the missing extension. bpmn-js is
 * authored ESM-in-a-CJS-typed-package and is only ever bundled by a real bundler
 * (the Vite lib build handles it fine); no Vitest `deps.inline` / `optimizer`
 * combination makes the deep peer-dep import resolve. This is the same jsdom wall
 * that leaves the full modeler with no runtime spec (ADR 0011) — the panel is
 * exactly the piece that cannot mount here.
 *
 * A static `import { createDesigner }` would poison collection (the panel loads
 * transitively at import time), so these tests dynamic-import inside skipped
 * bodies: they document the intended runtime contract and are ready to un-skip if
 * the resolution wall is ever lifted. The real runtime proof lives in the demo
 * page `apps/demo-webapp/bpmn/design.html` (the epic's acceptance check) and the
 * type-level conformance in `publicApi.spec.ts`.
 */
describe.skip("createDesigner (runtime, jsdom — blocked by the properties-panel resolution wall)", () => {
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
