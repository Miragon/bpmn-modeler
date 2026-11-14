import { describe, expect, it } from "vitest";

import { liesWithin, type DiagramBox } from "./selectionVisibility";

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
