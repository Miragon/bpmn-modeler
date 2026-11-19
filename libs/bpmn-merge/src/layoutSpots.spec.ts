import { describe, expect, it } from "vitest";

import { type LayoutSpot, isFlowSpot, sameSpot } from "./layoutSpots";

describe("isFlowSpot", () => {
    it("tells the spots of a flow from those of shapes", () => {
        const spots: LayoutSpot[] = [
            { kind: "flowEndOffShape", flow: "Flow_1", end: "B", at: "target", lies: "outside" },
            { kind: "flowThroughShape", flow: "Flow_2", shape: "C" },
            { kind: "shapesOverlap", shapes: ["A", "B"] },
            { kind: "shapeOutsideContainer", shape: "A", container: "Pool_1" },
            { kind: "boundaryEventOffHost", boundaryEvent: "E", host: "A" },
            { kind: "lanesOverlap", lanes: ["Lane_1", "Lane_2"] },
        ];

        expect(spots.filter(isFlowSpot).map(({ flow }) => flow)).toEqual(["Flow_1", "Flow_2"]);
    });
});

describe("sameSpot", () => {
    const overlap: LayoutSpot = { kind: "shapesOverlap", shapes: ["A", "B"] };
    const endOff: LayoutSpot = {
        kind: "flowEndOffShape",
        flow: "Flow_1",
        end: "B",
        at: "target",
        lies: "outside",
    };

    it.each<[string, LayoutSpot, LayoutSpot, boolean]>([
        ["the same spot", overlap, { kind: "shapesOverlap", shapes: ["A", "B"] }, true],
        [
            "two shapes named in the other order",
            overlap,
            { kind: "shapesOverlap", shapes: ["B", "A"] },
            true,
        ],
        ["another pair of shapes", overlap, { kind: "shapesOverlap", shapes: ["A", "C"] }, false],
        [
            "two lanes named in the other order",
            { kind: "lanesOverlap", lanes: ["L1", "L2"] },
            { kind: "lanesOverlap", lanes: ["L2", "L1"] },
            true,
        ],
        [
            "properties written in another order",
            endOff,
            { lies: "outside", at: "target", end: "B", flow: "Flow_1", kind: "flowEndOffShape" },
            true,
        ],
        ["an end that misses its shape another way", endOff, { ...endOff, lies: "inside" }, false],
        [
            "another kind on the same ids",
            { kind: "shapeOutsideContainer", shape: "A", container: "B" },
            { kind: "boundaryEventOffHost", boundaryEvent: "A", host: "B" },
            false,
        ],
        [
            "a flow through another shape",
            { kind: "flowThroughShape", flow: "Flow_1", shape: "C" },
            { kind: "flowThroughShape", flow: "Flow_1", shape: "D" },
            false,
        ],
        [
            "a boundary event off another host",
            { kind: "boundaryEventOffHost", boundaryEvent: "E", host: "A" },
            { kind: "boundaryEventOffHost", boundaryEvent: "E", host: "B" },
            false,
        ],
        [
            "a shape outside another container",
            { kind: "shapeOutsideContainer", shape: "A", container: "Lane_1" },
            { kind: "shapeOutsideContainer", shape: "A", container: "Lane_2" },
            false,
        ],
    ])("tells %s", (_, first, second, same) => {
        expect(sameSpot(first, second)).toBe(same);
        expect(sameSpot(second, first)).toBe(same);
    });
});
