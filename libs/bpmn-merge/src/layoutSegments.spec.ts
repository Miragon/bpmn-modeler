import { describe, expect, it } from "vitest";

import type { DiagramBounds } from "./layoutGeometry";
import {
    nearestOnSegment,
    outlinePointOn,
    pointAlong,
    segmentBounds,
    segmentEntersBounds,
    segmentEntersOutline,
    segmentEntersShape,
    segmentsCross,
    sharedRunLength,
    sideOfCenter,
    spansAlong,
} from "./layoutSegments";

const TASK: DiagramBounds = { x: 100, y: 100, width: 100, height: 80 };
const EVENT: DiagramBounds = { x: 300, y: 140, width: 36, height: 36 };
const GATEWAY: DiagramBounds = { x: 0, y: 0, width: 50, height: 50 };

describe("segmentBounds", () => {
    it("is the segment's bounding box, whichever way it runs", () => {
        expect(
            segmentBounds([
                { x: 10, y: 50 },
                { x: 4, y: 20 },
            ]),
        ).toEqual({
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
        expect(segmentEntersBounds([from, to], TASK)).toBe(enters);
    });

    it("never enters bounds without an inside", () => {
        const line: DiagramBounds = { x: 5, y: 0, width: 0, height: 10 };
        expect(
            segmentEntersBounds(
                [
                    { x: 0, y: 5 },
                    { x: 20, y: 5 },
                ],
                line,
            ),
        ).toBe(false);
    });
});

describe("segmentEntersShape", () => {
    it("lets a segment run inside the outline within the tolerance", () => {
        expect(
            segmentEntersShape(
                [
                    { x: 50, y: 102 },
                    { x: 250, y: 102 },
                ],
                TASK,
            ),
        ).toBe(false);
        expect(
            segmentEntersShape(
                [
                    { x: 50, y: 104 },
                    { x: 250, y: 104 },
                ],
                TASK,
            ),
        ).toBe(true);
    });
});

describe("outlinePointOn", () => {
    it.each([
        {
            label: "a horizontal line meets a task's right side",
            line: { axis: "y", at: 140 },
            bounds: TASK,
            outline: "rectangle",
            towards: 1,
            point: { x: 200, y: 140 },
        },
        {
            label: "a horizontal line meets a task's left side",
            line: { axis: "y", at: 140 },
            bounds: TASK,
            outline: "rectangle",
            towards: -1,
            point: { x: 100, y: 140 },
        },
        {
            label: "a line off center meets a circle, rounded to whole pixels",
            line: { axis: "y", at: 168 },
            bounds: EVENT,
            outline: "circle",
            towards: 1,
            point: { x: 333, y: 168 },
        },
        {
            label: "a vertical line meets a diamond's lower edges",
            line: { axis: "x", at: 35 },
            bounds: GATEWAY,
            outline: "diamond",
            towards: 1,
            point: { x: 35, y: 40 },
        },
        {
            label: "a line past the bounds misses",
            line: { axis: "y", at: 190 },
            bounds: TASK,
            outline: "rectangle",
            towards: 1,
            point: undefined,
        },
    ] as const)("$label", ({ line, bounds, outline, towards, point }) => {
        expect(outlinePointOn(line, bounds, outline, towards)).toEqual(point);
    });
});

describe("spansAlong", () => {
    it.each([
        { line: { axis: "y", at: 140 }, margin: 5, spans: true },
        { line: { axis: "y", at: 104 }, margin: 5, spans: false },
        { line: { axis: "y", at: 106 }, margin: 5, spans: true },
        { line: { axis: "y", at: 106 }, margin: 10, spans: false },
        { line: { axis: "x", at: 150 }, margin: 10, spans: true },
        { line: { axis: "x", at: 195 }, margin: 5, spans: false },
        { line: { axis: "x", at: 250 }, margin: 5, spans: false },
    ] as const)(
        "a line along $line.axis at $line.at, $margin px from the corners: $spans",
        ({ line, margin, spans }) => {
            expect(spansAlong(TASK, line, margin)).toBe(spans);
        },
    );
});

describe("sideOfCenter", () => {
    it("names the side of the center a point lies on, even inside the shape", () => {
        expect(sideOfCenter(TASK, { x: 103, y: 140 }, "x")).toBe(-1);
        expect(sideOfCenter(TASK, { x: 197, y: 140 }, "x")).toBe(1);
        expect(sideOfCenter(TASK, { x: 150, y: 103 }, "y")).toBe(-1);
        expect(sideOfCenter(TASK, { x: 150, y: 400 }, "y")).toBe(1);
    });
});

describe("segmentEntersOutline", () => {
    it("is false for a segment leaving the outline outwards", () => {
        expect(
            segmentEntersOutline(
                [
                    { x: 336, y: 158 },
                    { x: 400, y: 158 },
                ],
                EVENT,
                "circle",
            ),
        ).toBe(false);
    });

    it("is true for a segment leaving the outline back across the shape", () => {
        expect(
            segmentEntersOutline(
                [
                    { x: 336, y: 158 },
                    { x: 250, y: 158 },
                ],
                EVENT,
                "circle",
            ),
        ).toBe(true);
    });

    it("follows the outline, not the bounds, past a circle's corner", () => {
        expect(
            segmentEntersOutline(
                [
                    { x: 298, y: 146 },
                    { x: 306, y: 146 },
                ],
                EVENT,
                "circle",
            ),
        ).toBe(false);
        expect(
            segmentEntersOutline(
                [
                    { x: 298, y: 146 },
                    { x: 306, y: 146 },
                ],
                EVENT,
                "rectangle",
            ),
        ).toBe(true);
    });

    it("lets a segment run along the outline within the tolerance", () => {
        expect(
            segmentEntersOutline(
                [
                    { x: 102, y: 60 },
                    { x: 102, y: 250 },
                ],
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
            other: [
                { x: 50, y: 0 },
                { x: 50, y: 100 },
            ],
            cross: true,
        },
        {
            label: "touching at an end",
            other: [
                { x: 50, y: 50 },
                { x: 50, y: 100 },
            ],
            cross: false,
        },
        {
            label: "sharing an end",
            other: [
                { x: 100, y: 50 },
                { x: 100, y: 0 },
            ],
            cross: false,
        },
        {
            label: "running alongside",
            other: [
                { x: 0, y: 60 },
                { x: 100, y: 60 },
            ],
            cross: false,
        },
        {
            label: "on the same line",
            other: [
                { x: 20, y: 50 },
                { x: 80, y: 50 },
            ],
            cross: false,
        },
    ] as const)("is $cross when $label", ({ other, cross }) => {
        expect(
            segmentsCross(
                [
                    { x: 0, y: 50 },
                    { x: 100, y: 50 },
                ],
                other,
            ),
        ).toBe(cross);
    });
});

describe("sharedRunLength", () => {
    it.each([
        {
            label: "overlapping on one horizontal line",
            first: [
                { x: 0, y: 50 },
                { x: 100, y: 50 },
            ],
            second: [
                { x: 120, y: 50 },
                { x: 60, y: 50 },
            ],
            length: 40,
        },
        {
            label: "one pixel apart",
            first: [
                { x: 0, y: 50 },
                { x: 100, y: 50 },
            ],
            second: [
                { x: 60, y: 51 },
                { x: 120, y: 51 },
            ],
            length: 40,
        },
        {
            label: "two pixels apart",
            first: [
                { x: 0, y: 50 },
                { x: 100, y: 50 },
            ],
            second: [
                { x: 60, y: 52 },
                { x: 120, y: 52 },
            ],
            length: 0,
        },
        {
            label: "overlapping on one vertical line",
            first: [
                { x: 10, y: 0 },
                { x: 10, y: 100 },
            ],
            second: [
                { x: 10, y: 90 },
                { x: 10, y: 30 },
            ],
            length: 60,
        },
        {
            label: "on one line without overlap",
            first: [
                { x: 0, y: 50 },
                { x: 100, y: 50 },
            ],
            second: [
                { x: 110, y: 50 },
                { x: 200, y: 50 },
            ],
            length: 0,
        },
        {
            label: "crossing",
            first: [
                { x: 0, y: 50 },
                { x: 100, y: 50 },
            ],
            second: [
                { x: 50, y: 0 },
                { x: 50, y: 100 },
            ],
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
        expect(
            nearestOnSegment(
                [
                    { x: 0, y: 0 },
                    { x: 100, y: 0 },
                ],
                point,
            ),
        ).toEqual({
            point: nearest,
            distance,
        });
    });

    it("takes the point itself for a segment of no length", () => {
        expect(
            nearestOnSegment(
                [
                    { x: 5, y: 5 },
                    { x: 5, y: 5 },
                ],
                { x: 8, y: 9 },
            ),
        ).toEqual({
            point: { x: 5, y: 5 },
            distance: 5,
        });
    });
});

describe("pointAlong", () => {
    it.each([
        { share: 0, point: { x: 10, y: 20 } },
        { share: 0.25, point: { x: 20, y: 15 } },
        { share: 1, point: { x: 50, y: 0 } },
    ])("at share $share is $point", ({ share, point }) => {
        expect(
            pointAlong(
                [
                    { x: 10, y: 20 },
                    { x: 50, y: 0 },
                ],
                share,
            ),
        ).toEqual(point);
    });
});
