/** @jsxImportSource @bpmn-io/properties-panel/preact */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { act } from "@bpmn-io/properties-panel/preact/test-utils";
import EventBus from "diagram-js/lib/core/EventBus";

import PropertiesPanelRenderer from "./PropertiesPanelRenderer";
import NeutralPropertiesProvider from "../provider/NeutralPropertiesProvider";

/**
 * Regression proof for #1492: a selection made before the panel's
 * `selection.changed` effect subscribes (e.g. `selectElementsByIds` right after
 * the create factory resolves) must still reach the panel. bpmn-js cannot lay
 * out an SVG canvas in jsdom (see createViewer.spec.ts), so this drives the real
 * {@link PropertiesPanelRenderer} + {@link NeutralPropertiesProvider} with a real
 * diagram-js `EventBus`, a stubbed injector, and a mutable `selection` stub.
 */

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

function taskElement(id: string): any {
    const store: any = { name: "", documentation: [] };
    const bo: any = {
        ...store,
        $model: { ids: { assigned: () => null } },
        $instanceOf: (t: string) =>
            ["bpmn:Task", "bpmn:Activity", "bpmn:FlowNode", "bpmn:FlowElement"].includes(t),
        get: (k: string) => store[k],
    };
    return { id, type: "bpmn:Task", businessObject: bo };
}

function setup({
    selection,
    withSelectionService = true,
}: {
    selection?: any;
    withSelectionService?: boolean;
}) {
    const eventBus = new EventBus();
    const root = processElement();

    const elements: Record<string, any> = { [root.id]: root };
    let currentSelection = selection;

    const services: Record<string, any> = {
        canvas: { getRootElement: () => root },
        elementRegistry: { get: (id: string) => elements[id] },
        eventBus,
        translate: (text: string) => text,
        debounceInput: (fn: any) => fn,
        modeling: { updateProperties: vi.fn() },
        commandStack: undefined,
    };

    if (withSelectionService) {
        services.selection = { get: () => currentSelection };
    }

    const injector = { get: (name: string, _strict?: boolean) => services[name] };
    const renderer: any = new PropertiesPanelRenderer({}, injector, eventBus);
    new NeutralPropertiesProvider(renderer, injector);

    const registerTask = (task: any) => {
        elements[task.id] = task;
        return task;
    };

    const updates: any[] = [];
    eventBus.on("propertiesPanel.updated", (e: any) => updates.push(e.element));

    return {
        eventBus,
        renderer,
        root,
        registerTask,
        updates,
        container: () => renderer._container as HTMLElement,
        setSelection: (s: any) => {
            currentSelection = s;
        },
    };
}

// act() flushes the sticky-header layout effect synchronously, which reads
// IntersectionObserver — absent in jsdom.
beforeAll(() => {
    class IntersectionObserverStub {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
    }
    (globalThis as any).IntersectionObserver = IntersectionObserverStub;
});

describe("PropertiesPanel selection reconcile (#1492)", () => {
    it("targets a single element selected before the effect subscribes", async () => {
        const ctx = setup({ selection: undefined });
        const task = ctx.registerTask(taskElement("Task_1"));
        ctx.setSelection([task]);

        await act(() => {
            ctx.renderer._render(ctx.root);
        });

        expect(ctx.updates[ctx.updates.length - 1]).toBe(task);
    });

    it("targets a multi-selection made before the effect subscribes", async () => {
        const ctx = setup({ selection: undefined });
        const taskA = ctx.registerTask(taskElement("Task_A"));
        const taskB = ctx.registerTask(taskElement("Task_B"));
        ctx.setSelection([taskA, taskB]);

        await act(() => {
            ctx.renderer._render(ctx.root);
        });

        const last = ctx.updates[ctx.updates.length - 1];
        expect(Array.isArray(last)).toBe(true);
        expect(last).toHaveLength(2);
    });

    it("stays on the root and fires no update for an empty selection", async () => {
        const ctx = setup({ selection: [] });

        await act(() => {
            ctx.renderer._render(ctx.root);
        });

        expect(ctx.updates).toHaveLength(0);
        expect(ctx.container().querySelector(".bio-properties-panel")).not.toBeNull();
    });

    it("renders the root without crashing when no selection service exists", async () => {
        const ctx = setup({ withSelectionService: false });

        await act(() => {
            ctx.renderer._render(ctx.root);
        });

        expect(ctx.updates).toHaveLength(0);
        expect(ctx.container().querySelector(".bio-properties-panel")).not.toBeNull();
    });

    it("still reacts to selection.changed fired after mount", async () => {
        const ctx = setup({ selection: [] });
        const task = ctx.registerTask(taskElement("Task_1"));

        await act(() => {
            ctx.renderer._render(ctx.root);
        });

        await act(() => {
            ctx.eventBus.fire("selection.changed", { newSelection: [task] });
        });

        expect(ctx.updates[ctx.updates.length - 1]).toBe(task);
    });
});
