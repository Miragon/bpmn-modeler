import { describe, expect, it, vi } from "vitest";

import { FormReferenceStatusClient } from "./FormReferenceStatusClient";

function setup(referenceAvailable = true) {
    const handlers = new Map<string, (event?: unknown) => void>();
    let availabilityChanged: (() => void) | undefined;
    const eventBus = {
        on: vi.fn((event: string, handler: (event?: unknown) => void) =>
            handlers.set(event, handler),
        ),
    };
    const contextPad = { isOpen: vi.fn(() => true), open: vi.fn() };
    const unsubscribe = vi.fn(() => {
        availabilityChanged = undefined;
    });
    const port = {
        openReference: vi.fn(),
        isReferenceAvailable: vi.fn(() => referenceAvailable),
        onReferenceAvailabilityChanged: vi.fn((listener: () => void) => {
            availabilityChanged = listener;
            return unsubscribe;
        }),
    };
    const client = new FormReferenceStatusClient(eventBus, contextPad, port);
    return {
        client,
        handlers,
        contextPad,
        port,
        unsubscribe,
        notifyAvailabilityChanged: () => availabilityChanged?.(),
    };
}

describe("FormReferenceStatusClient", () => {
    it("delegates form availability to the navigation port", () => {
        const { client, port } = setup(true);

        expect(client.isResolved("Form_1")).toBe(true);
        expect(port.isReferenceAvailable).toHaveBeenCalledWith({
            id: "Form_1",
            kind: "form",
        });
    });

    it("keeps form navigation enabled when the port has no availability hook", () => {
        const handlers = new Map<string, (event?: unknown) => void>();
        const client = new FormReferenceStatusClient(
            { on: (event, handler) => void handlers.set(event, handler) },
            { isOpen: () => false, open: vi.fn() },
            { openReference: vi.fn() },
        );

        expect(client.isResolved("Form_1")).toBe(true);
    });

    it("refreshes an open context pad when reference availability changes", () => {
        const { handlers, contextPad, notifyAvailabilityChanged } = setup();
        const target = {
            businessObject: {
                get: () => undefined,
                extensionElements: {
                    values: [{ $type: "zeebe:FormDefinition", formId: "Form_1" }],
                },
            },
        };
        handlers.get("contextPad.open")?.({ current: { target } });

        notifyAvailabilityChanged();

        expect(contextPad.open).toHaveBeenCalledWith(target, true);
    });

    it("unsubscribes from the host port when the diagram is destroyed", () => {
        const { handlers, contextPad, unsubscribe, notifyAvailabilityChanged } = setup();
        handlers.get("contextPad.open")?.({
            current: {
                target: {
                    businessObject: {
                        get: () => undefined,
                        extensionElements: {
                            values: [{ $type: "zeebe:FormDefinition", formId: "Form_1" }],
                        },
                    },
                },
            },
        });

        handlers.get("diagram.destroy")?.();
        notifyAvailabilityChanged();

        expect(unsubscribe).toHaveBeenCalledOnce();
        expect(contextPad.open).not.toHaveBeenCalled();
    });
});
