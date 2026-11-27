import { describe, expect, it, vi } from "vitest";

import { alignToOriginOf } from "./alignToOriginAccessor";

function surfaceWith(services: Record<string, unknown>) {
    const injector = { get: (name: string) => services[name] ?? null };
    return { getService: <T>() => injector as T };
}

describe("alignToOriginOf", () => {
    it("is undefined on a surface built without align-to-origin", () => {
        expect(alignToOriginOf(surfaceWith({}))).toBeUndefined();
    });

    it("aligns through the surface's align-to-origin service", () => {
        const alignToOrigin = { align: vi.fn() };

        alignToOriginOf(surfaceWith({ alignToOrigin }))?.align();

        expect(alignToOrigin.align).toHaveBeenCalledOnce();
    });
});
