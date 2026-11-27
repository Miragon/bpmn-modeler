import { describe, expect, it, vi } from "vitest";

import { applyFavouriteBpmnElements } from "./favourites";

describe("applyFavouriteBpmnElements", () => {
    it("hands the append menu a copy of the types", () => {
        const setFavourites = vi.fn();
        const types = ["bpmn:UserTask"];

        applyFavouriteBpmnElements({ get: () => ({ setFavourites }) as never }, types);

        expect(setFavourites).toHaveBeenCalledWith(["bpmn:UserTask"]);
        expect(setFavourites.mock.calls[0]![0]).not.toBe(types);
    });

    it("ignores favourites on a surface built without the append menu", () => {
        expect(() =>
            applyFavouriteBpmnElements({ get: () => null }, ["bpmn:UserTask"]),
        ).not.toThrow();
    });
});
