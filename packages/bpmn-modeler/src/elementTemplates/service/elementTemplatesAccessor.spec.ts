import { describe, expect, it, vi } from "vitest";
import { NoModelerError } from "@miragon/bpmn-modeler-types";

import { elementTemplatesOf } from "./elementTemplatesAccessor";

function fakeEventBus() {
    const listeners = new Map<string, (event: unknown) => void>();
    return {
        on: vi.fn((event: string, listener: (event: unknown) => void) => {
            listeners.set(event, listener);
        }),
        off: vi.fn((event: string) => {
            listeners.delete(event);
        }),
        fire: (event: string, payload: unknown) => listeners.get(event)?.(payload),
    };
}

function surfaceWith(services: Record<string, unknown>, eventBus = fakeEventBus()) {
    const injector = { get: (name: string) => services[name] ?? null };
    return {
        getService: <T>(name: string) => (name === "eventBus" ? eventBus : injector) as T,
    };
}

const templateServices = () => ({
    elementTemplatesLoader: { setTemplates: vi.fn() },
    elementTemplateOffer: { setHidden: vi.fn() },
});

describe("elementTemplatesOf", () => {
    it("is undefined on a surface built without the element-templates feature", () => {
        expect(elementTemplatesOf(surfaceWith({}))).toBeUndefined();
        expect(
            elementTemplatesOf(surfaceWith({ elementTemplatesLoader: { setTemplates: vi.fn() } })),
        ).toBeUndefined();
    });

    it("throws NoModelerError on a destroyed surface", () => {
        const destroyed = {
            getService: () => {
                throw new NoModelerError();
            },
        };

        expect(() => elementTemplatesOf(destroyed)).toThrow(NoModelerError);
    });

    it("hands the templates to the loader and the hidden refs to the offer", () => {
        const services = templateServices();
        const templates = elementTemplatesOf(surfaceWith(services));
        const refs = [{ id: "mail", version: 2 }];

        templates?.setTemplates([{ id: "mail" }]);
        templates?.setHidden(refs);

        expect(services.elementTemplatesLoader.setTemplates).toHaveBeenCalledWith([{ id: "mail" }]);
        expect(services.elementTemplateOffer.setHidden).toHaveBeenCalledWith(refs);
    });

    it("reports validation errors until the listener is disposed", () => {
        const eventBus = fakeEventBus();
        const listener = vi.fn();
        const dispose = elementTemplatesOf(surfaceWith(templateServices(), eventBus))!.onErrors(
            listener,
        );

        eventBus.fire("elementTemplates.errors", { errors: ["bad"] });
        eventBus.fire("elementTemplates.errors", {});
        dispose();
        eventBus.fire("elementTemplates.errors", { errors: ["late"] });

        expect(listener.mock.calls).toEqual([[["bad"]], [[]]]);
        expect(eventBus.off).toHaveBeenCalledOnce();
    });
});
