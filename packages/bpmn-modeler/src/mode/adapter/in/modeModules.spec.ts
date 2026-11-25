import { describe, it, expect, vi } from "vitest";
import {
    SURFACE_MODE_CHANGED,
    SURFACE_MODE_SERVICE,
    type SurfaceModeChangedEvent,
} from "@miragon/bpmn-modeler-types/domain";

import {
    ModeAttribute,
    stripTemplateEntries,
    PopupMenuModeFilter,
    ModeUiModule,
} from "./modeModules";

describe("stripTemplateEntries", () => {
    const entries = () => ({
        "replace-with-task": { label: "Task" },
        "replace.template-abc": { label: "My template", group: { id: "templates" } },
        "differently-keyed": { label: "Other template", group: { id: "templates" } },
        "template-def": { label: "Root-keyed template" },
        "append-end-event": { label: "End event", group: { id: "events" } },
    });

    it("drops entries keyed template-* / *.template-*", () => {
        const kept = stripTemplateEntries(entries());
        expect(kept).not.toHaveProperty("replace.template-abc");
        expect(kept).not.toHaveProperty("template-def");
    });

    it("drops entries in the templates group even when differently keyed", () => {
        const kept = stripTemplateEntries(entries());
        expect(kept).not.toHaveProperty("differently-keyed");
    });

    it("keeps non-template entries", () => {
        const kept = stripTemplateEntries(entries());
        expect(kept).toHaveProperty("replace-with-task");
        expect(kept).toHaveProperty("append-end-event");
    });

    it("is the identity on a template-free menu", () => {
        const menu = { "replace-with-task": { label: "Task" } };
        expect(stripTemplateEntries(menu)).toEqual(menu);
    });
});

/** A recording double for the bpmn-js DI seam the filter constructs against. */
function harness(mode: "design" | "implement" | undefined) {
    type BusEvent = { stopPropagation(): void };
    const registered: Array<{ id: string; priority: number }> = [];
    const busListeners: Record<string, Array<{ priority: number; fn: (e: BusEvent) => void }>> = {};
    const popupMenu = {
        registerProvider: (id: string, priority: number, _provider: unknown) =>
            registered.push({ id, priority }),
    };
    const eventBus = {
        on: (type: string, priority: number, fn: (e: BusEvent) => void) => {
            (busListeners[type] ??= []).push({ priority, fn });
        },
    };
    const surfaceMode = mode ? { get: () => mode } : null;
    const injector = {
        get: <T>(name: string, _strict: false): T | null =>
            (name === SURFACE_MODE_SERVICE ? surfaceMode : null) as T | null,
    };
    const filter = new PopupMenuModeFilter(popupMenu, eventBus, injector);
    return { filter, registered, busListeners };
}

describe("PopupMenuModeFilter", () => {
    it("registers on all three menus at a priority below diagram-js default (1000)", () => {
        const { registered } = harness("implement");
        expect(registered.map((r) => r.id).sort()).toEqual([
            "bpmn-append",
            "bpmn-create",
            "bpmn-replace",
        ]);
        expect(registered.every((r) => r.priority < 1000)).toBe(true);
    });

    it("strips template entries in design mode", () => {
        const { filter } = harness("design");
        const middleware = filter.getPopupMenuEntries(null);
        const result = middleware({
            "replace-with-task": { label: "Task" },
            "replace.template-abc": { label: "Tpl", group: { id: "templates" } },
        });
        expect(result).toHaveProperty("replace-with-task");
        expect(result).not.toHaveProperty("replace.template-abc");
    });

    it("is the identity in implement mode", () => {
        const { filter } = harness("implement");
        const middleware = filter.getPopupMenuEntries(null);
        const menu = {
            "replace-with-task": { label: "Task" },
            "replace.template-abc": { label: "Tpl", group: { id: "templates" } },
        };
        expect(middleware(menu)).toEqual(menu);
    });

    it("defaults to identity on a surface without a mode", () => {
        const { filter } = harness(undefined);
        const middleware = filter.getPopupMenuEntries(null);
        const menu = { "replace.template-abc": { label: "Tpl" } };
        expect(middleware(menu)).toEqual(menu);
    });

    it("guards elementTemplates.select above the chooser priority, only in design", () => {
        const design = harness("design");
        const [listener] = design.busListeners["elementTemplates.select"];
        expect(listener.priority).toBeGreaterThan(1000);
        const designEvent = { stopPropagation: vi.fn() };
        listener.fn(designEvent);
        expect(designEvent.stopPropagation).toHaveBeenCalledTimes(1);

        const implement = harness("implement");
        const implementEvent = { stopPropagation: vi.fn() };
        implement.busListeners["elementTemplates.select"][0].fn(implementEvent);
        expect(implementEvent.stopPropagation).not.toHaveBeenCalled();
    });

    it("exposes the DI module under popupMenuModeFilter", () => {
        expect(ModeUiModule.__init__).toContain("popupMenuModeFilter");
        expect(ModeUiModule.popupMenuModeFilter).toEqual(["type", PopupMenuModeFilter]);
    });
});

function attributeHarness(withSurfaceMode: boolean) {
    const container = document.createElement("div");
    const panel = document.createElement("div");
    const listeners: Record<string, Array<(event: SurfaceModeChangedEvent) => void>> = {};
    const eventBus = {
        on: (event: string, listener: (event: SurfaceModeChangedEvent) => void) => {
            (listeners[event] ??= []).push(listener);
        },
    };
    const services: Record<string, unknown> = {
        "config.container": container,
        "config.propertiesPanel": { parent: panel },
        [SURFACE_MODE_SERVICE]: withSurfaceMode ? { get: () => "implement" } : null,
    };
    const injector = {
        get: <T>(name: string, _strict: false): T | null => (services[name] ?? null) as T | null,
    };
    new ModeAttribute(eventBus, injector);
    const announce = (mode: "design" | "implement"): void => {
        (listeners[SURFACE_MODE_CHANGED] ?? []).forEach((listener) => listener({ mode }));
    };
    const attributes = (): Array<string | null> =>
        [container, panel].map((root) => root.getAttribute("data-bpmn-mode"));
    return { announce, attributes, listeners };
}

describe("ModeAttribute", () => {
    it("marks the canvas container and the panel parent with each new mode", () => {
        const { announce, attributes } = attributeHarness(true);

        announce("design");
        expect(attributes()).toEqual(["design", "design"]);

        announce("implement");
        expect(attributes()).toEqual(["implement", "implement"]);
    });

    it("leaves the roots alone until the mode changes", () => {
        const { attributes } = attributeHarness(true);

        expect(attributes()).toEqual([null, null]);
    });

    it("listens to nothing on a surface without a mode", () => {
        const { listeners } = attributeHarness(false);

        expect(listeners).toEqual({});
    });

    it("is part of the mode UI module", () => {
        expect(ModeUiModule.__init__).toEqual(["popupMenuModeFilter", "modeAttribute"]);
        expect(ModeUiModule.modeAttribute).toEqual(["type", ModeAttribute]);
    });
});
