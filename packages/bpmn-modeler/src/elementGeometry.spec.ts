import { describe, expect, it } from "vitest";

import { liesWithin, viewboxCentredOn, type DiagramBox } from "./elementGeometry";

const viewbox: DiagramBox = { x: 0, y: 0, width: 800, height: 600 };

describe("liesWithin", () => {
    it.each<[string, DiagramBox, boolean]>([
        ["a box well inside the viewbox", { x: 100, y: 100, width: 100, height: 80 }, true],
        ["a box touching every edge", { x: 0, y: 0, width: 800, height: 600 }, true],
        ["a box cut off at the bottom", { x: 100, y: 550, width: 100, height: 80 }, false],
        ["a box cut off at the top", { x: 100, y: -10, width: 100, height: 80 }, false],
        ["a box cut off at the left", { x: -10, y: 100, width: 100, height: 80 }, false],
        ["a box cut off at the right", { x: 750, y: 100, width: 100, height: 80 }, false],
        ["a box outside the viewbox", { x: 2000, y: 2000, width: 100, height: 80 }, false],
    ])("says %s is %s", (_case, box, expected) => {
        expect(liesWithin(box, viewbox)).toBe(expected);
    });
});

describe("viewboxCentredOn", () => {
    it.each<[string, { x: number; y: number }, { width: number; height: number }, DiagramBox]>([
        [
            "keeps the size and puts the point in the middle",
            { x: 400, y: 300 },
            { width: 800, height: 600 },
            { x: 0, y: 0, width: 800, height: 600 },
        ],
        [
            "moves into negative coordinates for a point near the origin",
            { x: 50, y: 20 },
            { width: 200, height: 100 },
            { x: -50, y: -30, width: 200, height: 100 },
        ],
    ])("%s", (_case, centre, size, expected) => {
        expect(viewboxCentredOn(centre, size)).toEqual(expected);
    });

    it("ignores the rest of a viewbox handed in as the size", () => {
        const current = { x: 9, y: 9, width: 100, height: 50, scale: 2 };

        expect(viewboxCentredOn({ x: 0, y: 0 }, current)).toEqual({
            x: -50,
            y: -25,
            width: 100,
            height: 50,
        });
    });
});
