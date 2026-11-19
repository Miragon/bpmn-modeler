import { describe, expect, it } from "vitest";

import { type LayoutSpot, isFlowSpot } from "./layoutSpots";

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
