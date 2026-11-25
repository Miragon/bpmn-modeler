import { describe, expect, it, vi } from "vitest";

import { cleanupSurfaceDiagram, formatSurfaceDiagram } from "./editableSurface";
import type { SurfaceServices } from "./surfaceCore";

function surfaceWith(services: Record<string, unknown>): SurfaceServices {
    return {
        service<S>(name: string): S {
            if (!(name in services)) {
                throw new Error(`No provider for "${name}"!`);
            }
            return services[name] as S;
        },
        optionalService<S>(name: string): S | undefined {
            return services[name] as S | undefined;
        },
    };
}

describe("formatSurfaceDiagram", () => {
    it("formats through the surface's layouter", async () => {
        const formatted = { status: "formatted", diagnostics: [] };
        const surface = surfaceWith({ bpmnLayouter: { format: vi.fn(async () => formatted) } });

        await expect(formatSurfaceDiagram(surface)).resolves.toBe(formatted);
    });

    it("reports a failure, not a throw, on a surface built without the layout module", async () => {
        await expect(formatSurfaceDiagram(surfaceWith({}))).resolves.toEqual({
            status: "failed",
            message: "this surface was created without the layout module",
            diagnostics: [],
        });
    });
});

describe("cleanupSurfaceDiagram", () => {
    const reported = { status: "reported", items: [] };
    const applied = { status: "applied", items: [] };

    it("inspects or applies through the surface's cleanup", () => {
        const surface = surfaceWith({
            bpmnCleanup: { inspect: () => reported, apply: () => applied },
        });

        expect(cleanupSurfaceDiagram(surface)).toBe(reported);
        expect(cleanupSurfaceDiagram(surface, { apply: true })).toBe(applied);
    });

    it.each([undefined, { apply: true }])(
        "fails on a surface built without the layout module (%o)",
        (options) => {
            expect(cleanupSurfaceDiagram(surfaceWith({}), options)).toEqual({
                status: "failed",
                items: [],
                message: "this surface was created without the layout module",
            });
        },
    );
});
