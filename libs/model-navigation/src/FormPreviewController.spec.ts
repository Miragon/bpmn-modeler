import { afterEach, describe, expect, it, vi } from "vitest";
import { FormPreviewController } from "./FormPreviewController";
import type { FormPreviewRequest } from "./ModelNavigationPort";
import type { BusinessObjectLike } from "./extractReference";

vi.mock("bpmn-js/lib/util/ModelUtil", () => ({
    is: (element: { type?: string; $type?: string }, type: string) =>
        (element.type ?? element.$type) === type,
}));
afterEach(() => vi.unstubAllGlobals());

function task(id = "Form_1") {
    return {
        x: 100,
        y: 200,
        width: 100,
        height: 80,
        type: "bpmn:UserTask",
        businessObject: {
            get: () => undefined,
            extensionElements: { values: [{ $type: "zeebe:FormDefinition", formId: id }] },
        },
    };
}
type FixtureElement = Omit<ReturnType<typeof task>, "businessObject"> & {
    businessObject: BusinessObjectLike;
};
function setup(available = true, automatic = true) {
    const handlers = new Map<string, Array<(event?: unknown) => void>>();
    const fire = (name: string, event?: unknown) => handlers.get(name)?.forEach((fn) => fn(event));
    const selected: FixtureElement[] = [];
    let availabilityChanged = () => {};
    let automaticChanged = () => {};
    const unsubscribeAutomatic = vi.fn();
    const handles: Array<{
        close: ReturnType<typeof vi.fn>;
        reposition: ReturnType<typeof vi.fn>;
    }> = [];
    const open = vi.fn((_request: FormPreviewRequest) => {
        const handle = { close: vi.fn(), reposition: vi.fn() };
        handles.push(handle);
        return handle;
    });
    const unsubscribe = vi.fn();
    const port = {
        openReference: vi.fn(),
        formPreview: {
            open,
            isAutomaticEnabled: () => automatic,
            onAutomaticChanged: (listener: () => void) => {
                automaticChanged = listener;
                return unsubscribeAutomatic;
            },
        },
        isReferenceAvailable: vi.fn(() => available),
        onReferenceAvailabilityChanged: (listener: () => void) => {
            availabilityChanged = listener;
            return unsubscribe;
        },
    };
    const contextPad = { isOpen: () => true, open: vi.fn() };
    const canvas = {
        viewbox: vi.fn(() => ({ x: 0, y: 0, scale: 1 })),
        getContainer: () => ({
            getBoundingClientRect: () => ({ x: 50, y: 60, width: 800, height: 600 }),
            querySelector: () => null,
        }),
        getAbsoluteBBox: vi.fn(
            (element?: { x?: number; y?: number; width?: number; height?: number }) =>
                element?.x !== undefined
                    ? {
                          x: element.x,
                          y: element.y!,
                          width: element.width!,
                          height: element.height!,
                      }
                    : { x: 100, y: 200, width: 100, height: 80 },
        ),
        focus: vi.fn(),
    };
    const controller = new FormPreviewController(
        {
            on: (name, fn) => {
                const list = handlers.get(name) ?? [];
                list.push(fn);
                handlers.set(name, list);
            },
        },
        { get: () => selected },
        canvas,
        contextPad,
        port,
        { isResolved: () => port.isReferenceAvailable() },
    );
    const select = (...elements: FixtureElement[]) => {
        selected.splice(0, selected.length, ...elements);
        fire("selection.changed", { newSelection: elements });
    };
    return {
        controller,
        select,
        fire,
        open,
        handles,
        port,
        contextPad,
        canvas,
        unsubscribe,
        unsubscribeAutomatic,
        setAutomatic: (enabled: boolean) => {
            automatic = enabled;
            automaticChanged();
        },
        availabilityChanged: () => availabilityChanged(),
    };
}

describe("automatic linked form preview", () => {
    it.each([false, true])(
        "cancels automatic handles immediately even before visibility (%s)",
        (visible) => {
            const fixture = setup();
            const element = task();
            fixture.select(element);
            const stale = fixture.open.mock.calls[0][0];
            stale.onVisibilityChanged(visible);

            fixture.setAutomatic(false);
            expect(fixture.handles[0].close).toHaveBeenCalledOnce();
            expect(fixture.controller.isVisible(element)).toBe(false);
            expect(fixture.contextPad.open).toHaveBeenLastCalledWith(element, true);
            fixture.availabilityChanged();
            fixture.fire("elements.changed");
            expect(fixture.open).toHaveBeenCalledOnce();

            fixture.controller.openManual(element);
            expect(fixture.open.mock.calls[1][0].automatic).toBe(false);
            const manual = fixture.open.mock.calls[1][0];
            manual.onVisibilityChanged(true);
            stale.onVisibilityChanged(false);
            stale.onClose();
            stale.onExplicitRequest!();
            expect(fixture.controller.isVisible(element)).toBe(true);
            fixture.setAutomatic(true);
            fixture.setAutomatic(false);
            expect(fixture.handles[1].close).not.toHaveBeenCalled();
            manual.onClose();
            fixture.setAutomatic(true);
            expect(fixture.open).toHaveBeenCalledTimes(2);
        },
    );

    it("tracks selection while disabled, re-enables it once, and disposes the preference listener", () => {
        const fixture = setup(true, false);
        const element = task();
        fixture.select(element);
        expect(fixture.open).not.toHaveBeenCalled();
        fixture.setAutomatic(true);
        expect(fixture.open.mock.calls[0][0]).toMatchObject({ automatic: true, id: "Form_1" });
        fixture.open.mock.calls[0][0].onVisibilityChanged(true);
        fixture.setAutomatic(true);
        expect(fixture.open).toHaveBeenCalledOnce();
        fixture.setAutomatic(false);
        fixture.setAutomatic(true);
        expect(fixture.open).toHaveBeenCalledTimes(2);
        fixture.fire("diagram.destroy");
        expect(fixture.unsubscribeAutomatic).toHaveBeenCalledOnce();
        fixture.setAutomatic(false);
        fixture.setAutomatic(true);
        expect(fixture.open).toHaveBeenCalledTimes(2);
    });

    it("keeps a refreshed automatic preview when the preference is disabled", () => {
        const fixture = setup();
        fixture.select(task());
        fixture.open.mock.calls[0][0].onExplicitRequest!();
        fixture.setAutomatic(false);
        expect(fixture.handles[0].close).not.toHaveBeenCalled();
    });
    it("uses live rendered task bounds without reading the synchronous viewbox", () => {
        const fixture = setup();
        const target = task();
        fixture.select(target);
        const request = fixture.open.mock.calls[0][0];
        expect(request.anchor()).toEqual({
            canvas: { x: 50, y: 60, width: 800, height: 600 },
            task: { x: 150, y: 260, width: 100, height: 80 },
        });
        fixture.canvas.getAbsoluteBBox.mockReturnValue({ x: 200, y: 300, width: 200, height: 160 });
        expect(request.anchor().task).toEqual({ x: 250, y: 360, width: 200, height: 160 });
        expect(fixture.canvas.viewbox).not.toHaveBeenCalled();
    });
    it("keeps explicit refresh errors retryable when the index changes", () => {
        const { select, open, handles, port, availabilityChanged } = setup();
        select(task());
        const request = open.mock.calls[0][0];
        request.onVisibilityChanged(true);
        request.onExplicitRequest!();
        port.isReferenceAvailable.mockReturnValue(false);
        availabilityChanged();
        expect(handles[0].close).not.toHaveBeenCalled();
        expect(open).toHaveBeenCalledOnce();
    });
    it.each(["missing form", "malformed JSON excluded from the index"])(
        "indicates an initial %s, recovers on resolution, and cleans up ref changes",
        () => {
            const { select, open, port, handles, availabilityChanged, fire } = setup(false);
            const element = task();
            select(element);
            expect(open.mock.calls[0][0]).toMatchObject({ automatic: true, unavailable: true });
            open.mock.calls[0][0].onVisibilityChanged(true);
            fire("elements.changed");
            availabilityChanged();
            expect(open).toHaveBeenCalledOnce();
            port.isReferenceAvailable.mockReturnValue(true);
            availabilityChanged();
            expect(handles[0].close).toHaveBeenCalledOnce();
            expect(open.mock.calls[1][0].unavailable).toBe(false);
            element.businessObject.extensionElements.values[0].formId = "Other";
            port.isReferenceAvailable.mockReturnValue(false);
            fire("elements.changed");
            expect(handles[1].close).toHaveBeenCalledOnce();
            expect(open.mock.calls[2][0]).toMatchObject({ id: "Other", unavailable: true });
            select();
            expect(handles[2].close).toHaveBeenCalledOnce();
        },
    );
    it("waits for the initial index before indicating an unresolved reference", () => {
        const fixture = setup(false);
        const known = vi.fn(() => false);
        Object.assign(fixture.port, { isReferenceAvailabilityKnown: known });
        fixture.select(task());
        expect(fixture.open).not.toHaveBeenCalled();
        known.mockReturnValue(true);
        fixture.availabilityChanged();
        expect(fixture.open.mock.calls[0][0].unavailable).toBe(true);
    });
    it("does not discard a pending explicit read or its eventual error after availability loss", () => {
        const { select, controller, open, port, availabilityChanged, handles } = setup();
        const element = task();
        select(element);
        open.mock.calls[0][0].onClose();
        controller.openManual(element);
        const pending = open.mock.calls[1][0];
        expect(pending.automatic).toBe(false);
        port.isReferenceAvailable.mockReturnValue(false);
        availabilityChanged();
        expect(handles[1].close).not.toHaveBeenCalled();
        pending.onVisibilityChanged(true);
        expect(controller.isVisible(element)).toBe(true);
        pending.onClose();
        expect(handles[1].close).toHaveBeenCalledOnce();
        expect(controller.isVisible(element)).toBe(false);
        availabilityChanged();
        expect(open).toHaveBeenCalledTimes(2);
    });
    it("replaces an automatic panel with an indicator when availability changes", () => {
        const { select, open, port, availabilityChanged, handles, controller } = setup();
        const element = task();
        select(element);
        open.mock.calls[0][0].onVisibilityChanged(true);
        port.isReferenceAvailable.mockReturnValue(false);
        availabilityChanged();
        expect(handles[0].close).toHaveBeenCalledOnce();
        expect(open.mock.calls[1][0].unavailable).toBe(true);
        open.mock.calls[1][0].onVisibilityChanged(true);
        expect(controller.isVisible(element)).toBe(true);
        select();
        expect(handles[1].close).toHaveBeenCalledOnce();
    });
    it("observes container resize, accepts optional availability hooks, and exposes canvas focus", () => {
        const handlers = new Map<string, (event?: unknown) => void>();
        let resized = () => {};
        const observe = vi.fn();
        const disconnect = vi.fn();
        vi.stubGlobal(
            "ResizeObserver",
            class {
                constructor(callback: () => void) {
                    resized = callback;
                }
                observe = observe;
                disconnect = disconnect;
            },
        );
        const element = task();
        const pad = { x: 300, y: 100, width: 80, height: 150 };
        const container = {
            getBoundingClientRect: () => ({ x: 0, y: 0, width: 800, height: 600 }),
            querySelector: () => ({ getBoundingClientRect: () => pad }),
        };
        const handle = { close: vi.fn(), reposition: vi.fn() };
        const open = vi.fn((_request: FormPreviewRequest) => handle);
        const focus = vi.fn();
        const controller = new FormPreviewController(
            {
                on: (name, fn) => {
                    handlers.set(name, fn);
                },
            },
            { get: () => [element] },
            {
                getContainer: () => container,
                getAbsoluteBBox: () => pad,
                focus,
            },
            { isOpen: () => false, open: vi.fn() },
            { openReference: vi.fn(), formPreview: { open } },
            { isResolved: () => true },
        );
        controller.openManual(task());
        handlers.get("selection.changed")!();
        const request = open.mock.calls[0][0];
        expect(request.anchor().contextPad).toEqual(pad);
        request.focusCanvas();
        expect(focus).toHaveBeenCalledOnce();
        request.onVisibilityChanged(true);
        handlers.get("canvas.resized")!();
        for (let i = 0; i < 100; i++) handlers.get("canvas.viewbox.changed")!();
        resized();
        resized();
        expect(handle.reposition).toHaveBeenCalledTimes(103);
        expect(observe).toHaveBeenCalledWith(container);
        resized();
        handlers.get("diagram.destroy")!();
        expect(disconnect).toHaveBeenCalledOnce();
        expect(handle.close).toHaveBeenCalledOnce();
    });
    it("leaves hosts without the anchored capability unchanged", () => {
        const callbacks: Array<() => void> = [];
        const canvas = {
            viewbox: () => ({ x: 0, y: 0, scale: 1 }),
            getContainer: () => ({
                getBoundingClientRect: () => ({ x: 0, y: 0, width: 0, height: 0 }),
                querySelector: () => null,
            }),
            getAbsoluteBBox: () => ({ x: 0, y: 0, width: 0, height: 0 }),
            focus: vi.fn(),
        };
        new FormPreviewController(
            { on: (_name, callback) => callbacks.push(callback) },
            { get: () => [task()] },
            canvas,
            { isOpen: () => false, open: vi.fn() },
            { openReference: vi.fn() },
            { isResolved: () => true },
        );
        callbacks.forEach((fn) => fn());
        expect(canvas.focus).not.toHaveBeenCalled();
    });
    it("opens for a single resolvable task without moving focus and supplies a live anchor", () => {
        const { select, open, canvas } = setup();
        select(task());
        expect(open).toHaveBeenCalledOnce();
        const request = open.mock.calls[0][0];
        expect(request.automatic).toBe(true);
        expect(request.anchor().task).toEqual({ x: 150, y: 260, width: 100, height: 80 });
        expect(canvas.focus).not.toHaveBeenCalled();
    });
    it("waits for late availability but never auto-opens on pad refresh after dismissal", () => {
        const { select, open, port, availabilityChanged, fire, controller, contextPad } =
            setup(false);
        const element = task();
        select(element);
        expect(open.mock.calls[0][0].unavailable).toBe(true);
        port.isReferenceAvailable.mockReturnValue(true);
        availabilityChanged();
        const request = open.mock.calls[1][0];
        request.onVisibilityChanged(true);
        expect(controller.isVisible(element)).toBe(true);
        request.onClose();
        expect(controller.isVisible(element)).toBe(false);
        port.isReferenceAvailable.mockReturnValue(false);
        availabilityChanged();
        port.isReferenceAvailable.mockReturnValue(true);
        availabilityChanged();
        fire("contextPad.open");
        fire("elements.changed");
        select(element);
        expect(open).toHaveBeenCalledTimes(2);
        expect(contextPad.open).toHaveBeenCalled();
        controller.openManual(element);
        expect(open.mock.calls[2][0].automatic).toBe(false);
    });
    it("resets dismissal on reselect or a changed reference and closes on multiselect/deselection", () => {
        const { select, open, handles, fire } = setup();
        const element = task();
        select(element);
        open.mock.calls[0][0].onClose();
        select();
        select(element);
        expect(open).toHaveBeenCalledTimes(2);
        element.businessObject.extensionElements.values[0].formId = "Form_2";
        fire("elements.changed");
        expect(handles[1].close).toHaveBeenCalled();
        expect(open.mock.calls[2][0].id).toBe("Form_2");
        select(element, task());
        expect(handles[2].close).toHaveBeenCalled();
        select();
    });
    it("ignores stale visibility and close callbacks after selection switches", () => {
        const { select, open, controller } = setup();
        select(task());
        const old = open.mock.calls[0][0];
        const current = task("Form_2");
        select(current);
        open.mock.calls[1][0].onVisibilityChanged(true);
        old.onVisibilityChanged(false);
        old.onClose();
        old.onExplicitRequest!();
        expect(controller.isVisible(current)).toBe(true);
    });
    it("repositions on canvas and element changes and disposes with the diagram", () => {
        const { select, handles, fire, unsubscribe, availabilityChanged, open } = setup();
        select(task());
        for (const name of [
            "canvas.viewbox.changed",
            "elements.changed",
            "element.changed",
            "contextPad.open",
        ])
            fire(name);
        expect(handles[0].reposition).toHaveBeenCalledTimes(4);
        fire("diagram.destroy");
        expect(handles[0].close).toHaveBeenCalled();
        expect(unsubscribe).toHaveBeenCalledOnce();
        availabilityChanged();
        expect(open).toHaveBeenCalledOnce();
    });
    it("closes when availability vanishes and opens again only if not dismissed", () => {
        const { select, handles, open, port, availabilityChanged } = setup();
        select(task());
        port.isReferenceAvailable.mockReturnValue(false);
        availabilityChanged();
        expect(handles[0].close).toHaveBeenCalled();
        port.isReferenceAvailable.mockReturnValue(true);
        availabilityChanged();
        expect(open).toHaveBeenCalledTimes(3);
    });
    it("does not preview a resolved reference whose kind has no preview", () => {
        const { select, open } = setup();
        select({
            ...task(),
            type: "bpmn:CallActivity",
            businessObject: {
                get: (name: string) => (name === "calledElement" ? "Process_1" : undefined),
            },
        });
        select({
            ...task(),
            type: "bpmn:BusinessRuleTask",
            businessObject: {
                get: (name: string) => (name === "camunda:decisionRef" ? "Decision_1" : undefined),
            },
        });
        expect(open).not.toHaveBeenCalled();
    });
    it("previews the linked form of a start event of a process", () => {
        const { select, open } = setup();
        const process = { $type: "bpmn:Process" };
        select({
            ...task(),
            type: "bpmn:StartEvent",
            businessObject: { ...task("Form_Start").businessObject, $parent: process },
        });
        expect(open).toHaveBeenCalledOnce();
        expect(open.mock.calls[0][0].id).toBe("Form_Start");
    });
    it("does not preview the form of a start event inside a subprocess", () => {
        const { select, open } = setup();
        const subProcess = { $type: "bpmn:SubProcess" };
        select({
            ...task(),
            type: "bpmn:StartEvent",
            businessObject: { ...task().businessObject, $parent: subProcess },
        });
        expect(open).not.toHaveBeenCalled();
    });
    it("does not preview a task without a form", () => {
        const { select, open } = setup();
        select(task(""));
        expect(open).not.toHaveBeenCalled();
    });
});
