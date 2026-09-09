/** @jsxImportSource @bpmn-io/properties-panel/preact */
import { describe, it, expect, vi } from "vitest";
import EventBus from "diagram-js/lib/core/EventBus";

import PropertiesPanelRenderer from "./PropertiesPanelRenderer";
import NeutralPropertiesProvider from "../provider/NeutralPropertiesProvider";

/**
 * Renderer-level proof of the readonly derivation. bpmn-js cannot lay out an SVG
 * canvas in jsdom (see createViewer.spec.ts), so instead of a full modeler this
 * drives the real {@link PropertiesPanelRenderer} + {@link NeutralPropertiesProvider}
 * with a real diagram-js `EventBus` and a stubbed injector (fake canvas — no
 * SVG). `_render` then mounts the real panel with a fake element:
 * - no `modeling` service ⇒ readonly ⇒ every input disabled;
 * - `modeling` present ⇒ editable ⇒ inputs enabled.
 */

// A moddle-ish Process business object (drives is()/isAny() without bpmn-moddle).
function processElement(): any {
    const store: any = { isExecutable: true, documentation: [] };
    const bo: any = {
        ...store,
        $model: { ids: { assigned: () => null } },
        $instanceOf: (t: string) => ["bpmn:Process", "bpmn:FlowElementsContainer"].includes(t),
        get: (k: string) => store[k],
    };
    return { id: "Process_1", type: "bpmn:Process", businessObject: bo };
}

function setup(modeling: any) {
    const eventBus = new EventBus();
    const element = processElement();

    const services: Record<string, any> = {
        canvas: { getRootElement: () => element },
        elementRegistry: { get: () => element },
        eventBus,
        translate: (text: string) => text,
        debounceInput: (fn: any) => fn,
        modeling,
        commandStack: undefined,
    };

    const injector = {
        get: (name: string, _strict?: boolean) => services[name],
    };

    const config = {}; // no parent → renderer does not auto-attach on diagram.init
    const renderer: any = new PropertiesPanelRenderer(config, injector, eventBus);

    // The neutral provider registers itself with the renderer (acting as the panel).
    new NeutralPropertiesProvider(renderer, injector);

    renderer._render(element);

    return renderer._container as HTMLElement;
}

describe("PropertiesPanelRenderer readonly derivation", () => {
    it("disables every entry when no modeling service is registered (viewer)", () => {
        const container = setup(undefined);

        expect(container.querySelector(".bio-properties-panel")).not.toBeNull();

        const fields = [...container.querySelectorAll<HTMLInputElement>("input, textarea")];
        expect(fields.length).toBeGreaterThan(0);
        expect(fields.every((f) => f.disabled)).toBe(true);
    });

    it("leaves entries editable when a modeling service is present (modeler)", () => {
        const container = setup({ updateProperties: vi.fn() });

        const fields = [...container.querySelectorAll<HTMLInputElement>("input, textarea")];
        expect(fields.length).toBeGreaterThan(0);
        expect(fields.some((f) => !f.disabled)).toBe(true);
    });
});
