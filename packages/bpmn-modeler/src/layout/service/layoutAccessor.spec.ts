import { describe, expect, it, vi } from "vitest";

import { layoutOf } from "./layoutAccessor";

function surfaceWith(services: Record<string, unknown>) {
    const injector = { get: (name: string) => services[name] ?? null };
    return { getService: <T>() => injector as T };
}

describe("layoutOf", () => {
    it("is undefined on a surface built without the layout feature", () => {
        expect(layoutOf(surfaceWith({}))).toBeUndefined();
    });

    it("formats and cleans up through the surface's layout services", async () => {
        const formatted = { status: "formatted", diagnostics: [] };
        const applied = { status: "applied", items: [] };
        const layout = layoutOf(
            surfaceWith({
                bpmnLayouter: { format: vi.fn(async () => formatted) },
                bpmnCleanup: { inspect: vi.fn(), apply: () => applied },
            }),
        );

        await expect(layout?.formatDiagram()).resolves.toBe(formatted);
        expect(layout?.cleanupDiagram({ apply: true })).toBe(applied);
    });
});
