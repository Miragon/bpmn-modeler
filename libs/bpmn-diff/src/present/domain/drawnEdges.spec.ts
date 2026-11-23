import { describe, expect, it } from "vitest";

import { layoutOnlyEdgeIds } from "./drawnEdges";

const EDGES = new Set(["Flow_1", "Flow_2", "Flow_3", "Flow_4"]);
const isDrawnEdge = (id: string) => EDGES.has(id);

const changes = (over: Partial<Record<"added" | "removed" | "changed", string[]>> = {}) => ({
    added: [],
    removed: [],
    changed: [],
    layoutChanged: ["Task_A", "Flow_1"],
    ...over,
});

describe("layoutOnlyEdgeIds", () => {
    it("names a connection whose only change is its layout", () => {
        expect(layoutOnlyEdgeIds(changes(), isDrawnEdge)).toEqual(new Set(["Flow_1"]));
    });

    it("keeps a shape that only moved, which the stepper visits", () => {
        expect(layoutOnlyEdgeIds(changes(), isDrawnEdge)).not.toContain("Task_A");
    });

    it.each(["added", "removed", "changed"] as const)(
        "keeps a moved connection that was also %s",
        (category) => {
            expect(layoutOnlyEdgeIds(changes({ [category]: ["Flow_1"] }), isDrawnEdge)).toEqual(
                new Set(),
            );
        },
    );

    it("names no connection that did not move", () => {
        expect(
            layoutOnlyEdgeIds(changes({ changed: ["Flow_2"], removed: ["Flow_3"] }), isDrawnEdge),
        ).toEqual(new Set(["Flow_1"]));
    });
});
