import { describe, expect, it } from "vitest";

import type { DiagramBounds } from "./layoutGeometry";
import {
    outlinePointOn,
    segmentBounds,
    segmentEntersBounds,
    segmentEntersOutline,
    segmentEntersShape,
    sideOfCenter,
    spansAlong,
} from "./layoutGeometry";

const TASK: DiagramBounds = { x: 100, y: 100, width: 100, height: 80 };
const EVENT: DiagramBounds = { x: 300, y: 140, width: 36, height: 36 };
const GATEWAY: DiagramBounds = { x: 0, y: 0, width: 50, height: 50 };

describe("segmentBounds", () => {
    it("is the segment's bounding box, whichever way it runs", () => {
        expect(segmentBounds({ x: 10, y: 50 }, { x: 4, y: 20 })).toEqual({
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
        expect(segmentEntersBounds(from, to, TASK)).toBe(enters);
    });

    it("never enters bounds without an inside", () => {
        const line: DiagramBounds = { x: 5, y: 0, width: 0, height: 10 };
        expect(segmentEntersBounds({ x: 0, y: 5 }, { x: 20, y: 5 }, line)).toBe(false);
    });
});

describe("segmentEntersShape", () => {
    it("lets a segment run inside the outline within the tolerance", () => {
        expect(segmentEntersShape({ x: 50, y: 102 }, { x: 250, y: 102 }, TASK)).toBe(false);
        expect(segmentEntersShape({ x: 50, y: 104 }, { x: 250, y: 104 }, TASK)).toBe(true);
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
        expect(segmentEntersOutline({ x: 336, y: 158 }, { x: 400, y: 158 }, EVENT, "circle")).toBe(
            false,
        );
    });

    it("is true for a segment leaving the outline back across the shape", () => {
        expect(segmentEntersOutline({ x: 336, y: 158 }, { x: 250, y: 158 }, EVENT, "circle")).toBe(
            true,
        );
    });

    it("follows the outline, not the bounds, past a circle's corner", () => {
        expect(segmentEntersOutline({ x: 298, y: 146 }, { x: 306, y: 146 }, EVENT, "circle")).toBe(
            false,
        );
        expect(
            segmentEntersOutline({ x: 298, y: 146 }, { x: 306, y: 146 }, EVENT, "rectangle"),
        ).toBe(true);
    });

    it("lets a segment run along the outline within the tolerance", () => {
        expect(segmentEntersOutline({ x: 102, y: 60 }, { x: 102, y: 250 }, TASK, "rectangle")).toBe(
            false,
        );
    });
});
