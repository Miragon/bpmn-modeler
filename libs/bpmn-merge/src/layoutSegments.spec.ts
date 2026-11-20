import { describe, expect, it } from "vitest";

import type { DiagramBounds } from "./layoutGeometry";
import {
    nearestOnSegment,
    segmentBounds,
    segmentEntersBounds,
    segmentEntersOutline,
    segmentEntersShape,
    segmentsCross,
    sharedRunLength,
} from "./layoutSegments";

const TASK: DiagramBounds = { x: 100, y: 100, width: 100, height: 80 };
const EVENT: DiagramBounds = { x: 300, y: 140, width: 36, height: 36 };

describe("segmentBounds", () => {
    it("is the segment's bounding box, whichever way it runs", () => {
        expect(segmentBounds({ from: { x: 10, y: 50 }, to: { x: 4, y: 20 } })).toEqual({
            x: 4,
            y: 20,
            width: 6,
            height: 30,
        });
    });
});

describe("segmentEntersBounds", () => {
    it.each([
        { label: "crossing", from: { x: 50, y: 140 }, to: { x: 250, y: 140 }, enters: true },
        { label: "ending inside", from: { x: 50, y: 140 }, to: { x: 150, y: 140 }, enters: true },
        { label: "along the top", from: { x: 50, y: 100 }, to: { x: 250, y: 100 }, enters: false },
        {
            label: "ending on the left",
            from: { x: 50, y: 140 },
            to: { x: 100, y: 140 },
            enters: false,
        },
        { label: "passing beside", from: { x: 50, y: 50 }, to: { x: 90, y: 250 }, enters: false },
    ])("a segment $label: $enters", ({ from, to, enters }) => {
        expect(segmentEntersBounds({ from, to }, TASK)).toBe(enters);
    });

    it("never enters bounds without an inside", () => {
        const line: DiagramBounds = { x: 5, y: 0, width: 0, height: 10 };
        expect(segmentEntersBounds({ from: { x: 0, y: 5 }, to: { x: 20, y: 5 } }, line)).toBe(
            false,
        );
    });
});

describe("segmentEntersShape", () => {
    it("lets a segment run inside the outline within the tolerance", () => {
        expect(segmentEntersShape({ from: { x: 50, y: 102 }, to: { x: 250, y: 102 } }, TASK)).toBe(
            false,
        );
        expect(segmentEntersShape({ from: { x: 50, y: 104 }, to: { x: 250, y: 104 } }, TASK)).toBe(
            true,
        );
    });
});

describe("segmentEntersOutline", () => {
    it("is false for a segment leaving the outline outwards", () => {
        expect(
            segmentEntersOutline(
                { from: { x: 336, y: 158 }, to: { x: 400, y: 158 } },
                EVENT,
                "circle",
            ),
        ).toBe(false);
    });

    it("is true for a segment leaving the outline back across the shape", () => {
        expect(
            segmentEntersOutline(
                { from: { x: 336, y: 158 }, to: { x: 250, y: 158 } },
                EVENT,
                "circle",
            ),
        ).toBe(true);
    });

    it("follows the outline, not the bounds, past a circle's corner", () => {
        expect(
            segmentEntersOutline(
                { from: { x: 298, y: 146 }, to: { x: 306, y: 146 } },
                EVENT,
                "circle",
            ),
        ).toBe(false);
        expect(
            segmentEntersOutline(
                { from: { x: 298, y: 146 }, to: { x: 306, y: 146 } },
                EVENT,
                "rectangle",
            ),
        ).toBe(true);
    });

    it("lets a segment run along the outline within the tolerance", () => {
        expect(
            segmentEntersOutline(
                { from: { x: 102, y: 60 }, to: { x: 102, y: 250 } },
                TASK,
                "rectangle",
            ),
        ).toBe(false);
    });
});

describe("segmentsCross", () => {
    it.each([
        {
            label: "crossing inside both",
            other: { from: { x: 50, y: 0 }, to: { x: 50, y: 100 } },
            cross: true,
        },
        {
            label: "touching at an end",
            other: { from: { x: 50, y: 50 }, to: { x: 50, y: 100 } },
            cross: false,
        },
        {
            label: "sharing an end",
            other: { from: { x: 100, y: 50 }, to: { x: 100, y: 0 } },
            cross: false,
        },
        {
            label: "running alongside",
            other: { from: { x: 0, y: 60 }, to: { x: 100, y: 60 } },
            cross: false,
        },
        {
            label: "on the same line",
            other: { from: { x: 20, y: 50 }, to: { x: 80, y: 50 } },
            cross: false,
        },
    ] as const)("is $cross when $label", ({ other, cross }) => {
        expect(segmentsCross({ from: { x: 0, y: 50 }, to: { x: 100, y: 50 } }, other)).toBe(cross);
    });
});

describe("sharedRunLength", () => {
    it.each([
        {
            label: "overlapping on one horizontal line",
            first: { from: { x: 0, y: 50 }, to: { x: 100, y: 50 } },
            second: { from: { x: 120, y: 50 }, to: { x: 60, y: 50 } },
            length: 40,
        },
        {
            label: "one pixel apart",
            first: { from: { x: 0, y: 50 }, to: { x: 100, y: 50 } },
            second: { from: { x: 60, y: 51 }, to: { x: 120, y: 51 } },
            length: 40,
        },
        {
            label: "two pixels apart",
            first: { from: { x: 0, y: 50 }, to: { x: 100, y: 50 } },
            second: { from: { x: 60, y: 52 }, to: { x: 120, y: 52 } },
            length: 0,
        },
        {
            label: "overlapping on one vertical line",
            first: { from: { x: 10, y: 0 }, to: { x: 10, y: 100 } },
            second: { from: { x: 10, y: 90 }, to: { x: 10, y: 30 } },
            length: 60,
        },
        {
            label: "on one line without overlap",
            first: { from: { x: 0, y: 50 }, to: { x: 100, y: 50 } },
            second: { from: { x: 110, y: 50 }, to: { x: 200, y: 50 } },
            length: 0,
        },
        {
            label: "crossing",
            first: { from: { x: 0, y: 50 }, to: { x: 100, y: 50 } },
            second: { from: { x: 50, y: 0 }, to: { x: 50, y: 100 } },
            length: 0,
        },
    ] as const)("is $length when $label", ({ first, second, length }) => {
        expect(sharedRunLength(first, second)).toBe(length);
    });
});

describe("nearestOnSegment", () => {
    it.each([
        {
            label: "beside the middle",
            point: { x: 40, y: 30 },
            nearest: { x: 40, y: 0 },
            distance: 30,
        },
        {
            label: "before the start",
            point: { x: -30, y: 40 },
            nearest: { x: 0, y: 0 },
            distance: 50,
        },
        {
            label: "past the end",
            point: { x: 130, y: 40 },
            nearest: { x: 100, y: 0 },
            distance: 50,
        },
    ])("clamps to the segment for a point $label", ({ point, nearest, distance }) => {
        expect(nearestOnSegment({ from: { x: 0, y: 0 }, to: { x: 100, y: 0 } }, point)).toEqual({
            point: nearest,
            distance,
        });
    });

    it("takes the point itself for a segment of no length", () => {
        expect(
            nearestOnSegment({ from: { x: 5, y: 5 }, to: { x: 5, y: 5 } }, { x: 8, y: 9 }),
        ).toEqual({
            point: { x: 5, y: 5 },
            distance: 5,
        });
    });
});
