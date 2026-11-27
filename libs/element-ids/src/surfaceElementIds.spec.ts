import { describe, expect, it, vi } from "vitest";

import {
    applyElementIdSettings,
    proposeSurfaceElementIds,
    renameSurfaceElementIds,
} from "./surfaceElementIds";

function injectorWith(services: Record<string, unknown>) {
    return {
        get<T>(name: string, strict?: false): T | null {
            if (name in services) return services[name] as T;
            if (strict === false) return null;
            throw new Error(`No provider for "${name}"!`);
        },
    };
}

describe("element IDs on a surface", () => {
    const rows = { rows: [{ id: "Task_1" }] };
    const elementIds = {
        list: vi.fn(() => rows),
        rename: vi.fn(() => 2),
        configure: vi.fn(),
    };
    const withElementIds = injectorWith({ elementIds });
    const without = injectorWith({});

    it("proposes through the surface's service, passing the unchecked IDs as a set", () => {
        expect(proposeSurfaceElementIds(withElementIds, ["Task_2"])).toBe(rows);
        expect(elementIds.list).toHaveBeenLastCalledWith(new Set(["Task_2"]));

        proposeSurfaceElementIds(withElementIds, undefined);
        expect(elementIds.list).toHaveBeenLastCalledWith(undefined);
    });

    it("renames through the surface's service", () => {
        expect(renameSurfaceElementIds(withElementIds, ["Task_2"])).toBe(2);
        expect(elementIds.rename).toHaveBeenCalledWith(new Set(["Task_2"]));
    });

    it("configures the surface's service", () => {
        applyElementIdSettings(withElementIds, { followName: true });

        expect(elementIds.configure).toHaveBeenCalledWith({ followName: true });
    });

    it("proposes nothing, renames nothing and ignores settings without the module", () => {
        expect(proposeSurfaceElementIds(without, ["Task_2"])).toEqual({ rows: [] });
        expect(renameSurfaceElementIds(without, ["Task_2"])).toBe(0);
        expect(() => applyElementIdSettings(without, { followName: true })).not.toThrow();
    });
});
