import { describe, it, expect, vi } from "vitest";
import { stripTemplateEntries, PopupMenuModeFilter, ModeUiModule } from "./modeModules";

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
    const registered: Array<{ id: string; priority: number }> = [];
    const busListeners: Record<string, Array<{ priority: number; fn: (e: any) => void }>> = {};
    const popupMenu = {
        registerProvider: (id: string, priority: number, _provider: unknown) =>
            registered.push({ id, priority }),
    };
    const eventBus = {
        on: (type: string, priority: number, fn: (e: any) => void) => {
            (busListeners[type] ??= []).push({ priority, fn });
        },
    };
    const modeFilter = mode ? { getMode: () => mode } : null;
    const injector = {
        get: (name: string, _strict: boolean) =>
            name === "propertiesPanelModeFilter" ? modeFilter : undefined,
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
        const middleware = filter.getPopupMenuEntries(null) as (e: any) => any;
        const result = middleware({
            "replace-with-task": { label: "Task" },
            "replace.template-abc": { label: "Tpl", group: { id: "templates" } },
        });
        expect(result).toHaveProperty("replace-with-task");
        expect(result).not.toHaveProperty("replace.template-abc");
    });

    it("is the identity in implement mode", () => {
        const { filter } = harness("implement");
        const middleware = filter.getPopupMenuEntries(null) as (e: any) => any;
        const menu = {
            "replace-with-task": { label: "Task" },
            "replace.template-abc": { label: "Tpl", group: { id: "templates" } },
        };
        expect(middleware(menu)).toEqual(menu);
    });

    it("defaults to identity when no panel filter is registered", () => {
        const { filter } = harness(undefined);
        const middleware = filter.getPopupMenuEntries(null) as (e: any) => any;
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
