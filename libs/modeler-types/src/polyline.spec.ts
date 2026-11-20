import { describe, expect, it } from "vitest";

import {
    type BendTolerance,
    EXACT_BEND_TOLERANCE,
    type PolylinePoint,
    isRedundantBend,
    longestSegment,
    pointAlongSegment,
    polylineMidpoint,
    polylineSegments,
    segmentMiddle,
} from "./polyline";

describe("polylineSegments", () => {
    it("pairs each waypoint with the next and measures the leg between them", () => {
        expect(
            polylineSegments([
                { x: 0, y: 0 },
                { x: 30, y: 40 },
                { x: 30, y: 40 },
                { x: 30, y: 100 },
            ]),
        ).toStrictEqual([
            { from: { x: 0, y: 0 }, to: { x: 30, y: 40 }, length: 50 },
            { from: { x: 30, y: 40 }, to: { x: 30, y: 40 }, length: 0 },
            { from: { x: 30, y: 40 }, to: { x: 30, y: 100 }, length: 60 },
        ]);
    });

    it("has no segment for fewer than two waypoints", () => {
        expect(polylineSegments([])).toStrictEqual([]);
        expect(polylineSegments([{ x: 7, y: 9 }])).toStrictEqual([]);
    });
});

describe("pointAlongSegment", () => {
    it("is the point the share of the way from the segment's start to its end", () => {
        const segment = { from: { x: 10, y: 20 }, to: { x: 110, y: 220 } };

        expect(pointAlongSegment(segment, 0)).toStrictEqual({ x: 10, y: 20 });
        expect(pointAlongSegment(segment, 0.25)).toStrictEqual({ x: 35, y: 70 });
        expect(pointAlongSegment(segment, 1)).toStrictEqual({ x: 110, y: 220 });
    });
});

describe("segmentMiddle", () => {
    it("is half the sum of the segment's ends", () => {
        expect(segmentMiddle({ from: { x: 0.1, y: 10 }, to: { x: 100.7, y: 30 } })).toStrictEqual({
            x: 50.4,
            y: 20,
        });
    });
});

describe("polylineMidpoint", () => {
    it.each<[string, PolylinePoint[], PolylinePoint]>([
        [
            "halves a straight line",
            [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
            ],
            { x: 50, y: 0 },
        ],
        [
            "measures by the length along the bends",
            [
                { x: 100, y: 300 },
                { x: 300, y: 300 },
                { x: 300, y: 400 },
            ],
            { x: 250, y: 300 },
        ],
        [
            "lands on the bend where the halves meet there",
            [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 100, y: 100 },
            ],
            { x: 100, y: 0 },
        ],
        [
            "skips a zero-length segment before the middle",
            [
                { x: 0, y: 0 },
                { x: 0, y: 0 },
                { x: 100, y: 0 },
            ],
            { x: 50, y: 0 },
        ],
        [
            "skips a zero-length segment at the middle",
            [
                { x: 0, y: 0 },
                { x: 50, y: 0 },
                { x: 50, y: 0 },
                { x: 100, y: 0 },
            ],
            { x: 50, y: 0 },
        ],
        [
            "measures a flow that turns back on itself",
            [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 0, y: 0 },
            ],
            { x: 100, y: 0 },
        ],
        [
            "is the first point of a flow without length",
            [
                { x: 7, y: 9 },
                { x: 7, y: 9 },
            ],
            { x: 7, y: 9 },
        ],
        ["is the point of a flow of one point", [{ x: 7, y: 9 }], { x: 7, y: 9 }],
        ["is the origin of a flow without points", [], { x: 0, y: 0 }],
    ])("%s", (_case, points, middle) => {
        expect(polylineMidpoint(points)).toStrictEqual(middle);
    });

    it("returns a copy, never one of the waypoints", () => {
        const points = [{ x: 7, y: 9 }];

        expect(polylineMidpoint(points)).not.toBe(points[0]);
    });
});

describe("longestSegment", () => {
    it("is the longest segment, the first of equally long ones", () => {
        expect(
            longestSegment([
                { x: 0, y: 0 },
                { x: 0, y: 30 },
                { x: 160, y: 30 },
                { x: 160, y: 50 },
                { x: 0, y: 50 },
            ]),
        ).toStrictEqual({ from: { x: 0, y: 30 }, to: { x: 160, y: 30 }, length: 160 });
    });

    it("is undefined for a flow without two waypoints", () => {
        expect(longestSegment([{ x: 0, y: 0 }])).toBeUndefined();
    });
});

describe("isRedundantBend", () => {
    const WITHIN_HALF_A_UNIT: BendTolerance = { collinear: 1, beyond: 0.5 };
    const bend = (...coordinates: [number, number][]) =>
        coordinates.map(([x, y]) => ({ x, y })) as [PolylinePoint, PolylinePoint, PolylinePoint];

    it.each<[string, BendTolerance, [PolylinePoint, PolylinePoint, PolylinePoint], boolean]>([
        [
            "a point between its neighbours on a line",
            EXACT_BEND_TOLERANCE,
            bend([0, 0], [5, 0], [10, 0]),
            true,
        ],
        [
            "a point between its neighbours on a diagonal",
            EXACT_BEND_TOLERANCE,
            bend([0, 0], [10, 10], [20, 20]),
            true,
        ],
        [
            "the turning point of a flow that doubles back",
            EXACT_BEND_TOLERANCE,
            bend([0, 0], [20, 0], [10, 0]),
            false,
        ],
        [
            "the turning point of a flow back to its start",
            EXACT_BEND_TOLERANCE,
            bend([0, 0], [0, 30], [0, 0]),
            false,
        ],
        ["a corner", EXACT_BEND_TOLERANCE, bend([0, 0], [10, 0], [10, 10]), false],
        [
            "a point off the line by a fraction",
            EXACT_BEND_TOLERANCE,
            bend([0, 0], [5, 0.01], [10, 0]),
            false,
        ],
        [
            "a point off the line within the tolerance",
            WITHIN_HALF_A_UNIT,
            bend([0, 0], [5, 0.01], [10, 0]),
            true,
        ],
        [
            "a cross product at the tolerance",
            WITHIN_HALF_A_UNIT,
            bend([0, 0], [1, 0], [2, 1]),
            false,
        ],
        [
            "a point beyond its neighbour within the tolerance",
            WITHIN_HALF_A_UNIT,
            bend([0, 0], [10.5, 0], [10, 0]),
            true,
        ],
        [
            "a point beyond its neighbour past the tolerance",
            WITHIN_HALF_A_UNIT,
            bend([0, 0], [10.6, 0], [10, 0]),
            false,
        ],
        [
            "a point above a vertical run past the tolerance",
            WITHIN_HALF_A_UNIT,
            bend([0, 0], [0, -0.6], [0, 10]),
            false,
        ],
        [
            "a point below a vertical run within the tolerance",
            WITHIN_HALF_A_UNIT,
            bend([0, 0], [0, 10.5], [0, 10]),
            true,
        ],
    ])("%s", (_case, tolerance, [previous, point, next], redundant) => {
        expect(isRedundantBend(previous, point, next, tolerance)).toBe(redundant);
    });
});
