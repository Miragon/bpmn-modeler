import { describe, expect, it, vi } from "vitest";

import { elementIdsOf } from "./elementIdsAccessor";

function surfaceWith(services: Record<string, unknown>) {
    const injector = { get: (name: string) => services[name] ?? null };
    return { getService: <T>() => injector as T };
}

describe("elementIdsOf", () => {
    it("is undefined on a surface built without the element-ID feature", () => {
        expect(elementIdsOf(surfaceWith({}))).toBeUndefined();
    });

    it("proposes, renames and configures through the surface's element-ID service", () => {
        const rows = { rows: [] };
        const service = { list: vi.fn(() => rows), rename: vi.fn(() => 2), configure: vi.fn() };
        const elementIds = elementIdsOf(surfaceWith({ elementIds: service }));

        expect(elementIds?.propose(["Task_1"])).toBe(rows);
        expect(elementIds?.rename(["Task_1"])).toBe(2);
        elementIds?.configure({ followName: true });

        expect(service.list).toHaveBeenCalledWith(new Set(["Task_1"]));
        expect(service.configure).toHaveBeenCalledWith({ followName: true });
    });
});
