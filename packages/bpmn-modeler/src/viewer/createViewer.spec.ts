import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { NoModelerError } from "@miragon/bpmn-modeler-types";
import { createViewer } from "./createViewer";
import type { BpmnViewer } from "./viewer";

/**
 * The first runtime-testable factory in the package: a real bpmn-js
 * `NavigatedViewer` stands up in jsdom — with two stubs jsdom lacks (`getBBox`,
 * `matchMedia`) and the minimap aliased to its ESM build in `vitest.config.ts`
 * (its CJS interop is the jsdom blocker recorded in ADR 0011).
 *
 * The load-bearing assertion is the readonly proof — `getService("modeling")`
 * and `getService("commandStack")` throw because those services are never
 * registered on a viewer — and it needs no rendered diagram, so it runs for
 * real. The render-dependent cases (`loadDiagram` and everything that reads a
 * live element registry) run against real Chromium in
 * `viewerRoundTrip.browser.spec.ts` and `viewState.browser.spec.ts` (ADR
 * 0032): jsdom lays nothing out, so bpmn-js's `canvas.viewbox()` dereferences
 * an SVG `transform.baseVal` jsdom does not implement.
 */

beforeAll(() => {
    // jsdom lays out nothing, so `getBBox` is missing on SVG elements; bpmn-js
    // measures labels with it during construction.
    const svgProto = SVGElement.prototype as unknown as { getBBox?: () => DOMRect };
    if (!svgProto.getBBox) {
        svgProto.getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 }) as DOMRect;
    }
    // jsdom ships no `matchMedia`; the "automatic" theme reads it on the first
    // frame. A never-matching stub resolves the default to light.
    if (!window.matchMedia) {
        (window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = (
            query: string,
        ) =>
            ({
                matches: false,
                media: query,
                addEventListener: () => undefined,
                removeEventListener: () => undefined,
            }) as unknown as MediaQueryList;
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

    it("registers the mode-invariant canvas chrome (ADR 0022)", async () => {
        container = mount();
        viewer = await createViewer(container);

        // Minimap + the readonly token-simulation variant enter the DI graph …
        expect(viewer.getService("minimap")).toBeDefined();
        expect(viewer.getService("toggleMode")).toBeDefined();
        // … and the focus reticle mounts inside this instance's canvas container.
        expect(container.querySelector(".canvas-focus-indicator")).not.toBeNull();

        viewer.destroy();
        expect(container.querySelector(".canvas-focus-indicator")).toBeNull();
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
            // The panel is orthogonal to navigation: no context pad without it.
            expect(() => viewer!.getService("contextPad")).toThrow();
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

    describe("model navigation capability (opt-in, #1445)", () => {
        const port = { openReference: vi.fn() };

        afterEach(() => {
            port.openReference.mockReset();
        });

        it("registers the diagram-js pad + navigation provider, no editing services", async () => {
            container = mount();
            viewer = await createViewer(container, {
                capabilities: { modelNavigation: port },
            });

            expect(viewer.getService("contextPad")).toBeDefined();
            expect(viewer.getService("navigateContextPadProvider")).toBeDefined();
            expect(viewer.getService("formReferenceStatusClient")).toBeDefined();
            expect(viewer.getService("modelNavigationPort")).toBe(port);

            // The pad is diagram-js's, not bpmn-js's, so it drags in no editing.
            expect(() => viewer!.getService("modeling")).toThrow();
            expect(() => viewer!.getService("commandStack")).toThrow();
        });

        it("contributes exactly the navigate entry on a referencing element", async () => {
            container = mount();
            viewer = await createViewer(container, {
                capabilities: { modelNavigation: port },
            });

            // Build the business object directly — no importXML (jsdom SVG wall).
            const moddle = viewer.getService<{ create(type: string, attrs: object): unknown }>(
                "moddle",
            );
            const businessObject = moddle.create("bpmn:CallActivity", {
                calledElement: "handleRejection",
            });
            const element = { type: "bpmn:CallActivity", businessObject };

            const contextPad = viewer.getService<{
                getEntries(
                    target: unknown,
                ): Record<string, { action: { click: (event: Event, element: unknown) => void } }>;
            }>("contextPad");
            const entries = contextPad.getEntries(element);
            expect(Object.keys(entries)).toEqual(["navigate-to-referenced-model"]);

            entries["navigate-to-referenced-model"].action.click(new Event("click"), element);
            expect(port.openReference).toHaveBeenCalledWith({
                id: "handleRejection",
                kind: "process",
            });
        });

        it("contributes nothing on an element with no reference", async () => {
            container = mount();
            viewer = await createViewer(container, {
                capabilities: { modelNavigation: port },
            });

            const moddle = viewer.getService<{ create(type: string, attrs: object): unknown }>(
                "moddle",
            );
            const businessObject = moddle.create("bpmn:Task", {});
            const contextPad = viewer.getService<{
                getEntries(target: unknown): Record<string, unknown>;
            }>("contextPad");

            expect(contextPad.getEntries({ type: "bpmn:Task", businessObject })).toEqual({});
        });

        it("registers no context pad when the capability is omitted", async () => {
            container = mount();
            viewer = await createViewer(container);

            expect(() => viewer!.getService("contextPad")).toThrow();
            expect(() => viewer!.getService("navigateContextPadProvider")).toThrow();
        });
    });

    describe("leaves no residue when initialisation fails (#1495)", () => {
        it("destroys the partial viewer and restores the container and document", async () => {
            container = mount();
            const parent = mount();

            const realMatchMedia = window.matchMedia;
            const mediaHolder = window as unknown as { matchMedia: typeof window.matchMedia };
            // `setTheme("automatic")` reads matchMedia on the first frame — the
            // post-allocation failure the guard has to clean up after.
            mediaHolder.matchMedia = () => {
                throw new Error("matchMedia boom");
            };
            const addSpy = vi.spyOn(document, "addEventListener");
            const removeSpy = vi.spyOn(document, "removeEventListener");

            try {
                await expect(
                    createViewer(container, { propertiesPanel: { parent } }),
                ).rejects.toThrow("matchMedia boom");

                expect(container.querySelector(".bjs-container")).toBeNull();
                expect(container.querySelector(".canvas-focus-indicator")).toBeNull();
                expect(parent.getAttribute("data-bpmn-theme")).toBeNull();

                const keydownAdds = addSpy.mock.calls.filter(([type]) => type === "keydown").length;
                const keydownRemoves = removeSpy.mock.calls.filter(
                    ([type]) => type === "keydown",
                ).length;
                expect(keydownRemoves).toBe(keydownAdds);
            } finally {
                addSpy.mockRestore();
                removeSpy.mockRestore();
                mediaHolder.matchMedia = realMatchMedia;
            }

            // The same roots must be reusable once the failure condition is gone.
            viewer = await createViewer(container, { propertiesPanel: { parent } });
            expect(viewer.getService("canvas")).toBeDefined();
            parent.remove();
        });
    });
});
