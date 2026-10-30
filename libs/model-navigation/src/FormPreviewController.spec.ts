import { afterEach, describe, expect, it, vi } from "vitest";
import { FormPreviewController } from "./FormPreviewController";
import type { FormPreviewRequest } from "./ModelNavigationPort";

vi.mock("bpmn-js/lib/util/ModelUtil", () => ({
    is: (element: { type?: string }, type: string) => element.type === type,
}));
afterEach(() => vi.unstubAllGlobals());

function task(id = "Form_1") {
    return {
        type: "bpmn:UserTask",
        businessObject: {
            get: () => undefined,
            extensionElements: { values: [{ $type: "zeebe:FormDefinition", formId: id }] },
        },
    };
}
function setup(available = true) {
    const elements: Array<
        ReturnType<typeof task> & {
            parent?: object;
            hidden?: boolean;
            waypoints?: Array<{ x: number; y: number }>;
        }
    > = [];
    const handlers = new Map<string, Array<(event?: unknown) => void>>();
    const fire = (name: string, event?: unknown) => handlers.get(name)?.forEach((fn) => fn(event));
    const selected: ReturnType<typeof task>[] = [];
    let availabilityChanged = () => {};
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
        formPreview: { open },
        isReferenceAvailable: vi.fn(() => available),
        onReferenceAvailabilityChanged: (listener: () => void) => {
            availabilityChanged = listener;
            return unsubscribe;
        },
    };
    const contextPad = { isOpen: () => true, open: vi.fn() };
    const canvas = {
        getContainer: () => ({
            getBoundingClientRect: () => ({ x: 50, y: 60, width: 800, height: 600 }),
            querySelector: () => null,
        }),
        getAbsoluteBBox: vi.fn(
            (element?: { x?: number; y?: number; width?: number; height?: number }) =>
                element?.x !== undefined
                    ? (element as { x: number; y: number; width: number; height: number })
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
        { getAll: () => elements },
    );
    const select = (...elements: ReturnType<typeof task>[]) => {
        selected.splice(0, selected.length, ...elements);
        fire("selection.changed", { newSelection: elements });
    };
    return {
        controller,
        elements,
        select,
        fire,
        open,
        handles,
        port,
        contextPad,
        canvas,
        unsubscribe,
        availabilityChanged: () => availabilityChanged(),
    };
}

describe("automatic linked form preview", () => {
    it("uses narrow boxes for each bent flow segment instead of its enclosing box", () => {
        const fixture = setup();
        const root = task();
        const target = { ...task(), parent: root };
        fixture.elements.push({
            ...task(),
            parent: root,
            waypoints: [
                { x: 200, y: 140 },
                { x: 300, y: 140 },
                { x: 300, y: 400 },
            ],
        });
        fixture.select(target);
        expect(fixture.open.mock.calls[0][0].anchor().obstacles).toEqual([
            { x: 248, y: 198, width: 104, height: 4 },
            { x: 348, y: 198, width: 4, height: 264 },
        ]);
    });
    it("anchors obstacles in viewport coordinates, excluding ancestors, hidden and inactive shapes", () => {
        const fixture = setup();
        const root = task();
        const lane = {
            ...task(),
            type: "bpmn:Lane",
            parent: root,
            x: 50,
            y: 150,
            width: 600,
            height: 250,
        };
        const target = { ...task(), parent: root };
        const successor = { ...task(), parent: root };
        const label = { ...task(), parent: root };
        fixture.elements.push(
            root,
            lane,
            target,
            successor,
            label,
            { ...task(), parent: root, hidden: true },
            { ...task(), parent: task() },
        );
        fixture.select(target);
        expect(fixture.open.mock.calls[0][0].anchor().obstacles).toEqual([
            { x: 150, y: 260, width: 100, height: 80 },
            { x: 150, y: 260, width: 100, height: 80 },
        ]);
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
        let frame = () => {};
        const schedule = vi.fn((callback: () => void) => {
            frame = callback;
            return 1;
        });
        const cancel = vi.fn();
        vi.stubGlobal("requestAnimationFrame", schedule);
        vi.stubGlobal("cancelAnimationFrame", cancel);
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
            { getContainer: () => container, getAbsoluteBBox: () => pad, focus },
            { isOpen: () => false, open: vi.fn() },
            { openReference: vi.fn(), formPreview: { open } },
            { isResolved: () => true },
            { getAll: () => [] },
        );
        controller.openManual(task());
        handlers.get("selection.changed")!();
        const request = open.mock.calls[0][0];
        expect(request.anchor().contextPad).toEqual(pad);
        request.focusCanvas();
        expect(focus).toHaveBeenCalledOnce();
        request.onVisibilityChanged(true);
        handlers.get("canvas.resized")!();
        resized();
        resized();
        expect(schedule).toHaveBeenCalledOnce();
        expect(handle.reposition).not.toHaveBeenCalled();
        frame();
        expect(handle.reposition).toHaveBeenCalledOnce();
        expect(observe).toHaveBeenCalledWith(container);
        resized();
        handlers.get("diagram.destroy")!();
        expect(disconnect).toHaveBeenCalledOnce();
        expect(cancel).toHaveBeenCalledWith(1);
    });
    it("leaves hosts without the anchored capability unchanged", () => {
        const callbacks: Array<() => void> = [];
        const canvas = {
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
            { getAll: () => [] },
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
    it("does not preview other element types or tasks without a form", () => {
        const { select, open } = setup();
        select({ ...task(), type: "bpmn:CallActivity" });
        select(task(""));
        expect(open).not.toHaveBeenCalled();
    });
});
