import { describe, expect, it, vi } from "vitest";

import { applyImplementationStatus } from "./implementationStatus";

describe("applyImplementationStatus", () => {
    it("hands the host's status to the surface's map client", () => {
        const applyStatus = vi.fn();

        applyImplementationStatus({ get: () => ({ applyStatus }) as never }, { "class:a.B": true });

        expect(applyStatus).toHaveBeenCalledWith({ "class:a.B": true });
    });

    it("tolerates a status push on a surface without code link", () => {
        expect(() => applyImplementationStatus({ get: () => null }, {})).not.toThrow();
    });
});
