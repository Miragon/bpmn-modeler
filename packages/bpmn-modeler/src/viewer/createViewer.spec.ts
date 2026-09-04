import { beforeAll, afterEach, describe, expect, it } from "vitest";
import { NoModelerError } from "@miragon/bpmn-modeler-types";
import { createViewer } from "./createViewer";
import type { BpmnViewer } from "./viewer";

/**
 * The first runtime-testable factory in the package: the viewer graph excludes
 * camunda-bpmn-js's minimap CJS-interop (the jsdom blocker that keeps the full
 * modeler untestable here, ADR 0011), so a real bpmn-js `NavigatedViewer` stands
 * up in jsdom — with two stubs jsdom lacks (`getBBox`, `matchMedia`).
 *
 * The load-bearing assertion is the readonly proof — `getService("modeling")`
 * and `getService("commandStack")` throw because those services are never
 * registered on a viewer — and it needs no rendered diagram, so it runs for
 * real. The render-dependent cases (`loadDiagram` and everything that reads a
 * live element registry) are `it.skip`ped: jsdom lays nothing out, so bpmn-js's
 * `canvas.viewbox()` dereferences an SVG `transform.baseVal` jsdom does not
 * implement. Those paths are covered manually via the demo page
 * (`apps/demo-webapp/bpmn/viewer.html`) and the Playwright/Chrome MCP flow in
 * the PR's verification steps.
 */

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="156" y="100" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

beforeAll(() => {
    // jsdom lays out nothing, so `getBBox` is missing on SVG elements; bpmn-js
    // measures labels with it during construction.
    if (!(SVGElement.prototype as any).getBBox) {
        (SVGElement.prototype as any).getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 });
    }
    // jsdom ships no `matchMedia`; the "automatic" theme reads it on the first
    // frame. A never-matching stub resolves the default to light.
    if (!window.matchMedia) {
        (window as any).matchMedia = (query: string) => ({
            matches: false,
            media: query,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
        });
    }
});

let viewer: BpmnViewer | undefined;
let container: HTMLElement | undefined;

function mount(): HTMLElement {
    const el = document.createElement("div");
    el.style.width = "800px";
    el.style.height = "600px";
    document.body.appendChild(el);
    return el;
}

afterEach(() => {
    viewer?.destroy();
    viewer = undefined;
    container?.remove();
    container = undefined;
});

describe("createViewer (runtime, jsdom)", () => {
    it("resolves a handle with viewport + selection accessors", async () => {
        container = mount();
        viewer = await createViewer(container);

        expect(viewer.viewport).toBeDefined();
        expect(viewer.selection).toBeDefined();
    });

    it("exposes the readonly core services and rejects editing ones", async () => {
        container = mount();
        viewer = await createViewer(container);

        expect(viewer.getService("canvas")).toBeDefined();
        expect(viewer.getService("elementRegistry")).toBeDefined();
        expect(viewer.getService("eventBus")).toBeDefined();
        expect(viewer.getService("overlays")).toBeDefined();
        expect(viewer.getService("selection")).toBeDefined();

        // The readonly proof: the editor services are never registered on a
        // viewer, so resolving one throws. No rendered diagram required.
        expect(() => viewer!.getService("modeling")).toThrow();
        expect(() => viewer!.getService("commandStack")).toThrow();
    });

    it("engages theming and flips data-bpmn-theme on setTheme", async () => {
        container = mount();
        viewer = await createViewer(container, { theme: "light" });
        expect(container.getAttribute("data-bpmn-theme")).toBe("light");

        viewer.setTheme("dark");
        expect(container.getAttribute("data-bpmn-theme")).toBe("dark");
    });

    it("throws NoModelerError from accessors after destroy", async () => {
        container = mount();
        viewer = await createViewer(container);
        viewer.destroy();

        expect(() => viewer!.viewport).toThrow(NoModelerError);
        expect(() => viewer!.selection).toThrow(NoModelerError);
        expect(() => viewer!.getService("canvas")).toThrow(NoModelerError);
    });

    describe("readonly properties panel (opt-in, #1443)", () => {
        // Entry-level readonly behaviour (every input disabled, no add/remove
        // affordances) is proven in the lib's own specs
        // (`propertiesPanelRenderer.spec.tsx`, `applyReadonly.spec.ts`); the AC
        // "interact with every entry, export unchanged" needs a rendered panel
        // body and thus `importXML` — the jsdom SVG wall above. The demo page
        // (`viewer.html`) is the manual/browser proof for that path.
        let parent: HTMLElement;

        afterEach(() => {
            parent.remove();
        });

        it("mounts the panel and keeps modeling/commandStack unregistered", async () => {
            container = mount();
            parent = mount();
            viewer = await createViewer(container, { propertiesPanel: { parent } });

            // The renderer attaches on `diagram.init`, no importXML needed.
            expect(parent.querySelector(".bio-properties-panel-container")).not.toBeNull();
            expect(viewer.getService("propertiesPanel")).toBeDefined();

            // The load-bearing readonly proof: registering the panel must not
            // drag any editing service into the DI graph.
            expect(() => viewer!.getService("modeling")).toThrow();
            expect(() => viewer!.getService("commandStack")).toThrow();
        });

        it("exposes the host custom-group slot", async () => {
            container = mount();
            parent = mount();
            viewer = await createViewer(container, { propertiesPanel: { parent } });

            const registry = viewer.getService<{
                registerGroups(ids: readonly string[]): void;
                has(id: string): boolean;
            }>("customPropertiesGroups");
            registry.registerGroups(["myCustomGroup"]);
            expect(registry.has("myCustomGroup")).toBe(true);
        });

        it("themes the panel parent alongside the container", async () => {
            container = mount();
            parent = mount();
            viewer = await createViewer(container, {
                theme: "light",
                propertiesPanel: { parent },
            });

            expect(container.getAttribute("data-bpmn-theme")).toBe("light");
            expect(parent.getAttribute("data-bpmn-theme")).toBe("light");

            viewer.setTheme("dark");
            expect(container.getAttribute("data-bpmn-theme")).toBe("dark");
            expect(parent.getAttribute("data-bpmn-theme")).toBe("dark");
        });

        it("stays inert when the option is omitted", async () => {
            container = mount();
            parent = mount();
            viewer = await createViewer(container);

            expect(document.querySelector(".bio-properties-panel-container")).toBeNull();
            expect(() => viewer!.getService("propertiesPanel")).toThrow();
        });
    });

    // Render-dependent: jsdom has no SVG layout, so bpmn-js's viewbox transform
    // throws on import. Covered manually via the demo page + Playwright.
    it.skip("loads a diagram, selects an element, and round-trips XML/SVG", async () => {
        container = mount();
        viewer = await createViewer(container);

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
