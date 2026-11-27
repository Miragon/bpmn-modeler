import { describe, expect, it, vi } from "vitest";

import { transactionBoundariesOf } from "./transactionBoundariesAccessor";

function surfaceWith(services: Record<string, unknown>) {
    const injector = { get: (name: string) => services[name] ?? null };
    return { getService: <T>() => injector as T };
}

describe("transactionBoundariesOf", () => {
    it("is undefined on a surface built without transaction boundaries", () => {
        expect(transactionBoundariesOf(surfaceWith({}))).toBeUndefined();
    });

    it("shows or hides the marks through the visibility service", () => {
        const transactionBoundaryVisibility = { setVisible: vi.fn() };

        transactionBoundariesOf(surfaceWith({ transactionBoundaryVisibility }))?.setVisible(false);

        expect(transactionBoundaryVisibility.setVisible).toHaveBeenCalledWith(false);
    });
});
