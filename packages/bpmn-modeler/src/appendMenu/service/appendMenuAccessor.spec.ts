import { describe, expect, it, vi } from "vitest";

import { appendMenuOf } from "./appendMenuAccessor";

function surfaceWith(services: Record<string, unknown>) {
    const injector = { get: (name: string) => services[name] ?? null };
    return { getService: <T>() => injector as T };
}

describe("appendMenuOf", () => {
    it("is undefined on a surface built without the append-menu feature", () => {
        expect(appendMenuOf(surfaceWith({}))).toBeUndefined();
    });

    it("sets the favourites on the surface's append menu", () => {
        const appendMenuOverride = { setFavourites: vi.fn() };

        appendMenuOf(surfaceWith({ appendMenuOverride }))?.setFavourites(["bpmn:UserTask"]);

        expect(appendMenuOverride.setFavourites).toHaveBeenCalledWith(["bpmn:UserTask"]);
    });
});
