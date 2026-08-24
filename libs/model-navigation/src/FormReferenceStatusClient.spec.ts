import { describe, expect, it, vi } from "vitest";

import { FormReferenceStatusClient } from "./FormReferenceStatusClient";

function setup() {
    const handlers = new Map<string, (event?: unknown) => void>();
    const eventBus = {
        on: vi.fn((event: string, handler: (event?: unknown) => void) =>
            handlers.set(event, handler),
        ),
    };
    const contextPad = { isOpen: vi.fn(() => true), open: vi.fn() };
    const client = new FormReferenceStatusClient(eventBus, contextPad);
    return { client, handlers, contextPad };
}

describe("FormReferenceStatusClient", () => {
    it("starts pessimistically with no resolved form ids", () => {
        const { client } = setup();
        expect(client.isResolved("Form_1")).toBe(false);
    });

    it("replaces the resolution snapshot", () => {
        const { client } = setup();
        client.applyStatus(["Form_1"]);
        expect(client.isResolved("Form_1")).toBe(true);
        client.applyStatus([]);
        expect(client.isResolved("Form_1")).toBe(false);
    });

    it("refreshes an open context pad when form visibility changes", () => {
        const { client, handlers, contextPad } = setup();
        const target = {
            businessObject: {
                get: () => undefined,
                extensionElements: {
                    values: [{ $type: "zeebe:FormDefinition", formId: "Form_1" }],
                },
            },
        };
        handlers.get("contextPad.open")?.({ current: { target } });

        client.applyStatus(["Form_1"]);

        expect(contextPad.open).toHaveBeenCalledWith(target, true);
    });
});
