import { describe, expect, it } from "vitest";

import { leastCoveringPlacement, type ScreenBox } from "./mergeOverlayPlacement";

const box = (left: number, top: number, width = 100, height = 50): ScreenBox => ({
    left,
    top,
    width,
    height,
});

const PANE = box(0, 0, 1000, 800);

describe("leastCoveringPlacement", () => {
    it("takes the first candidate when none covers anything", () => {
        expect(
            leastCoveringPlacement(
                [
                    { box: box(100, 100), placement: "below" },
                    { box: box(300, 100), placement: "above" },
                ],
                { keepClear: [], bounds: PANE, neighbours: [] },
            ),
        ).toBe("below");
    });

    it("moves away from a neighbour, such as the other end of a flow", () => {
        expect(
            leastCoveringPlacement(
                [
                    { box: box(100, 100), placement: "below" },
                    { box: box(300, 100), placement: "above" },
                ],
                { keepClear: [], bounds: PANE, neighbours: [box(120, 120, 40, 40)] },
            ),
        ).toBe("above");
    });

    it("covers a neighbour rather than the pad or the element", () => {
        expect(
            leastCoveringPlacement(
                [
                    { box: box(100, 100), placement: "over the pad" },
                    { box: box(300, 100), placement: "over a neighbour" },
                ],
                {
                    keepClear: [box(110, 110, 20, 20)],
                    bounds: PANE,
                    neighbours: [box(300, 100, 100, 50)],
                },
            ),
        ).toBe("over a neighbour");
    });

    it("stays inside the pane rather than avoiding a neighbour", () => {
        expect(
            leastCoveringPlacement(
                [
                    { box: box(-60, 100), placement: "cut off" },
                    { box: box(300, 100), placement: "inside" },
                ],
                { keepClear: [], bounds: PANE, neighbours: [box(300, 100, 50, 50)] },
            ),
        ).toBe("inside");
    });

    it("counts a touch of a few pixels as no overlap", () => {
        expect(
            leastCoveringPlacement(
                [
                    { box: box(100, 100), placement: "touching" },
                    { box: box(300, 100), placement: "clear" },
                ],
                { keepClear: [box(198, 100, 40, 40)], bounds: PANE, neighbours: [] },
            ),
        ).toBe("touching");
    });

    it("leaves the rest of the diagram readable once the neighbourhood is clear", () => {
        expect(
            leastCoveringPlacement(
                [
                    { box: box(100, 100), placement: "over a task" },
                    { box: box(300, 100), placement: "over nothing" },
                ],
                {
                    keepClear: [],
                    bounds: PANE,
                    neighbours: [],
                    others: [box(120, 110, 40, 30)],
                },
            ),
        ).toBe("over nothing");
    });

    it("has no placement without candidates", () => {
        expect(leastCoveringPlacement([], { keepClear: [], neighbours: [] })).toBeUndefined();
    });
});
