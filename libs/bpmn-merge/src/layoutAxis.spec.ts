import { describe, expect, it } from "vitest";

import {
    across,
    along,
    atAcross,
    boundsShifted,
    crossAxisOf,
    farBorderOf,
    farSideOf,
    grownAlong,
    liesAheadWithin,
    lineThrough,
    nearSideOf,
    offsetAlong,
    outlinePointOn,
    pointShifted,
    sideOfCenter,
    spansAlong,
    stripPast,
} from "./layoutAxis";
import type { DiagramBounds } from "./layoutGeometry";

const TASK: DiagramBounds = { x: 100, y: 100, width: 100, height: 80 };
const EVENT: DiagramBounds = { x: 300, y: 140, width: 36, height: 36 };
const GATEWAY: DiagramBounds = { x: 0, y: 0, width: 50, height: 50 };

describe("liesAheadWithin", () => {
    const strip: DiagramBounds = { x: 200, y: 0, width: 50, height: 300 };

    it.each([
        { other: { x: 260, y: 100, width: 100, height: 80 }, axis: "x", ahead: true },
        { other: { x: 280, y: 100, width: 100, height: 80 }, axis: "x", ahead: false },
        { other: { x: 220, y: 100, width: 100, height: 80 }, axis: "x", ahead: true },
        { other: { x: 0, y: 300, width: 1200, height: 200 }, axis: "x", ahead: false },
        { other: { x: 210, y: 305, width: 100, height: 40 }, axis: "x", ahead: false },
        { other: { x: 210, y: 305, width: 20, height: 40 }, axis: "y", ahead: true },
        { other: { x: 260, y: 305, width: 20, height: 40 }, axis: "y", ahead: false },
        { other: { x: 100, y: 100, width: 50, height: 50 }, axis: "x", ahead: false },
    ] as const)("$other along $axis: $ahead", ({ other, axis, ahead }) => {
        expect(liesAheadWithin(axis, strip, other, 15)).toBe(ahead);
    });
});

describe("the axis helpers", () => {
    const point = { x: 10, y: 20 };

    it.each([
        { axis: "x", along: 10, across: 20, atAcross: { x: 10, y: 5 }, shifted: { x: 17, y: 20 } },
        { axis: "y", along: 20, across: 10, atAcross: { x: 5, y: 20 }, shifted: { x: 10, y: 27 } },
    ] as const)("read and move a point along $axis", ({ axis, ...expected }) => {
        expect(along(axis, point)).toBe(expected.along);
        expect(across(axis, point)).toBe(expected.across);
        expect(atAcross(axis, point, 5)).toEqual(expected.atAcross);
        expect(pointShifted(axis, point, 7)).toEqual(expected.shifted);
    });

    it.each([
        {
            axis: "x",
            near: 100,
            far: 200,
            shifted: { x: 130, y: 100, width: 100, height: 80 },
            grown: { x: 100, y: 100, width: 130, height: 80 },
            strip: { x: 200, y: 100, width: 30, height: 80 },
        },
        {
            axis: "y",
            near: 100,
            far: 180,
            shifted: { x: 100, y: 130, width: 100, height: 80 },
            grown: { x: 100, y: 100, width: 100, height: 110 },
            strip: { x: 100, y: 180, width: 100, height: 30 },
        },
    ] as const)("read and move bounds along $axis", ({ axis, ...expected }) => {
        expect(nearSideOf(axis, TASK)).toBe(expected.near);
        expect(farSideOf(axis, TASK)).toBe(expected.far);
        expect(boundsShifted(axis, TASK, 30)).toEqual(expected.shifted);
        expect(grownAlong(axis, TASK, 30)).toEqual(expected.grown);
        expect(stripPast(axis, TASK, 30)).toEqual(expected.strip);
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
    it("names the side of the center a point lies on along the line, even inside the shape", () => {
        const horizontal = { axis: "y", at: 140 } as const;
        const vertical = { axis: "x", at: 150 } as const;
        expect(sideOfCenter(TASK, { x: 103, y: 140 }, horizontal)).toBe(-1);
        expect(sideOfCenter(TASK, { x: 197, y: 140 }, horizontal)).toBe(1);
        expect(sideOfCenter(TASK, { x: 150, y: 103 }, vertical)).toBe(-1);
        expect(sideOfCenter(TASK, { x: 150, y: 400 }, vertical)).toBe(1);
    });

    it("answers on the line's own side, which outlinePointOn takes as towards", () => {
        const line = { axis: "y", at: 120 } as const;
        const from = { x: 400, y: 120 };
        expect(outlinePointOn(line, TASK, "rectangle", sideOfCenter(TASK, from, line))).toEqual({
            x: 200,
            y: 120,
        });
    });
});

describe("crossAxisOf", () => {
    it.each([
        { axis: "x", cross: "y" },
        { axis: "y", cross: "x" },
    ] as const)("$axis crosses $cross", ({ axis, cross }) => {
        expect(crossAxisOf(axis)).toBe(cross);
    });
});

describe("offsetAlong", () => {
    it.each([
        { axis: "x", offset: { dx: 7, dy: 0 } },
        { axis: "y", offset: { dx: 0, dy: 7 } },
    ] as const)("moves along $axis only", ({ axis, offset }) => {
        expect(offsetAlong(axis, 7)).toEqual(offset);
    });
});

describe("farBorderOf", () => {
    it.each([
        { axis: "x", border: "right" },
        { axis: "y", border: "bottom" },
    ] as const)("ends $axis at the $border border", ({ axis, border }) => {
        expect(farBorderOf(axis)).toBe(border);
    });
});

describe("lineThrough", () => {
    it.each([
        { from: { x: 10, y: 40 }, to: { x: 90, y: 40 }, line: { axis: "y", at: 40 } },
        { from: { x: 30, y: 10 }, to: { x: 30, y: 90 }, line: { axis: "x", at: 30 } },
        { from: { x: 30, y: 40 }, to: { x: 30, y: 40 }, line: { axis: "y", at: 40 } },
        { from: { x: 10, y: 10 }, to: { x: 90, y: 90 }, line: undefined },
    ] as const)("$from to $to lie on $line", ({ from, to, line }) => {
        expect(lineThrough(from, to)).toEqual(line);
    });
});
