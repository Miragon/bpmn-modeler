import { describe, expect, it } from "vitest";

import type { Point } from "./layoutGeometry";
import { withoutRedundantPoints } from "./layoutPolyline";

describe("withoutRedundantPoints", () => {
    it.each<[string, Point[], Point[]]>([
        [
            "drops a repeated point",
            [
                { x: 0, y: 0 },
                { x: 0, y: 0 },
                { x: 100, y: 0 },
            ],
            [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
            ],
        ],
        [
            "drops the middle of a straight run",
            [
                { x: 0, y: 0 },
                { x: 50, y: 0 },
                { x: 100, y: 0 },
                { x: 100, y: 40 },
                { x: 100, y: 80 },
            ],
            [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 100, y: 80 },
            ],
        ],
        [
            "keeps a corner",
            [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 100, y: 80 },
            ],
            [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 100, y: 80 },
            ],
        ],
        [
            "keeps the turning point of a flow that doubles back",
            [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 50, y: 0 },
            ],
            [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 50, y: 0 },
            ],
        ],
        [
            "keeps the turning point of a vertical flow that doubles back",
            [
                { x: 0, y: 0 },
                { x: 0, y: 100 },
                { x: 0, y: 20 },
                { x: 60, y: 20 },
            ],
            [
                { x: 0, y: 0 },
                { x: 0, y: 100 },
                { x: 0, y: 20 },
                { x: 60, y: 20 },
            ],
        ],
        [
            "keeps the middle of a run off its line by a fraction",
            [
                { x: 0, y: 0 },
                { x: 50, y: 0.3 },
                { x: 100, y: 0 },
            ],
            [
                { x: 0, y: 0 },
                { x: 50, y: 0.3 },
                { x: 100, y: 0 },
            ],
        ],
    ])("%s", (_case, points, kept) => {
        expect(withoutRedundantPoints(points)).toStrictEqual(kept);
    });
});
