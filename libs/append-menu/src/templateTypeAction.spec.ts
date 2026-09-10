import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { executeTemplateTypeAction } from "./templateTypeAction";
import type { ElementTemplate } from "@miragon/bpmn-modeler-element-template-chooser";

const template = {
    id: "t1",
    name: "Multi",
    appliesTo: ["bpmn:ServiceTask", "bpmn:SendTask"],
    properties: [],
} as unknown as ElementTemplate;

function services() {
    const newElement = { id: "created" };
    return {
        newElement,
        elementTemplates: { createElement: vi.fn((_t: ElementTemplate) => newElement) },
        autoPlace: { append: vi.fn() },
        create: { start: vi.fn() },
        mouse: { getLastMoveEvent: vi.fn(() => new Event("mousemove")) },
    };
}

// The modeler runs in browsers where KeyboardEvent is global; the node test env
// has none, so provide a minimal stand-in for the `instanceof` branch.
class FakeKeyboardEvent {}
beforeAll(() => {
    (globalThis as { KeyboardEvent?: unknown }).KeyboardEvent = FakeKeyboardEvent;
});
afterAll(() => {
    delete (globalThis as { KeyboardEvent?: unknown }).KeyboardEvent;
});

describe("executeTemplateTypeAction", () => {
    it("clones the template with the chosen elementType before creating", () => {
        const s = services();
        executeTemplateTypeAction(
            s,
            { providerId: "bpmn-append", target: {} },
            template,
            "bpmn:SendTask",
            new Event("click"),
        );
        const passed = s.elementTemplates.createElement.mock.calls[0]![0];
        expect(passed.elementType).toEqual({ value: "bpmn:SendTask" });
        expect(passed.id).toBe("t1");
        // The original template is left untouched.
        expect(template.elementType).toBeUndefined();
    });

    it("auto-places on the append path when autoPlace is available", () => {
        const s = services();
        const target = { id: "source" };
        executeTemplateTypeAction(
            s,
            { providerId: "bpmn-append", target },
            template,
            "bpmn:SendTask",
            new Event("click"),
        );
        expect(s.autoPlace.append).toHaveBeenCalledWith(target, s.newElement);
        expect(s.create.start).not.toHaveBeenCalled();
    });

    it("falls back to interactive create for bpmn:BoundaryEvent (not auto-placeable)", () => {
        const s = services();
        const target = { id: "source" };
        const event = new Event("click");
        executeTemplateTypeAction(
            s,
            { providerId: "bpmn-append", target },
            template,
            "bpmn:BoundaryEvent",
            event,
        );
        expect(s.autoPlace.append).not.toHaveBeenCalled();
        expect(s.create.start).toHaveBeenCalledWith(event, s.newElement, { source: target });
    });

    it("starts create without a source on the bpmn-create path", () => {
        const s = services();
        const event = new Event("click");
        executeTemplateTypeAction(
            s,
            { providerId: "bpmn-create", target: {} },
            template,
            "bpmn:SendTask",
            event,
        );
        expect(s.create.start).toHaveBeenCalledWith(event, s.newElement, undefined);
    });

    it("uses the last mouse move event when triggered by keyboard", () => {
        const s = services();
        const moveEvent = new Event("mousemove");
        s.mouse.getLastMoveEvent.mockReturnValue(moveEvent);
        executeTemplateTypeAction(
            { ...s, autoPlace: undefined },
            { providerId: "bpmn-create", target: {} },
            template,
            "bpmn:SendTask",
            new FakeKeyboardEvent() as unknown as Event,
        );
        expect(s.mouse.getLastMoveEvent).toHaveBeenCalled();
        expect(s.create.start).toHaveBeenCalledWith(moveEvent, s.newElement, undefined);
    });
});
