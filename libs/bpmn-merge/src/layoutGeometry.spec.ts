import { describe, expect, it } from "vitest";

import {
    type DiagramBounds,
    across,
    along,
    areaOutside,
    atAcross,
    bordersAt,
    boundsShifted,
    farSideOf,
    gapBetween,
    grownAlong,
    keepsClearOf,
    liesAheadWithin,
    nearSideOf,
    pointShifted,
    stripPast,
} from "./layoutGeometry";

const TASK: DiagramBounds = { x: 100, y: 100, width: 100, height: 80 };
const EVENT: DiagramBounds = { x: 300, y: 140, width: 36, height: 36 };

describe("areaOutside", () => {
    it.each([
        { bounds: { x: 120, y: 120, width: 50, height: 40 }, outside: 0 },
        { bounds: { x: 150, y: 150, width: 100, height: 80 }, outside: 8000 - 50 * 30 },
        { bounds: { x: 400, y: 400, width: 10, height: 10 }, outside: 100 },
    ])("$bounds lies $outside px² outside the task", ({ bounds, outside }) => {
        expect(areaOutside(bounds, TASK)).toBe(outside);
    });
});

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

describe("bordersAt", () => {
    it.each([
        { label: "the right border", point: { x: 200, y: 140 }, borders: ["right"] },
        {
            label: "the left border, give or take the tolerance",
            point: { x: 98, y: 120 },
            borders: ["left"],
        },
        { label: "the top border", point: { x: 150, y: 100 }, borders: ["top"] },
        {
            label: "two borders at a corner",
            point: { x: 200, y: 180 },
            borders: ["right", "bottom"],
        },
        { label: "no border inside the bounds", point: { x: 150, y: 140 }, borders: [] },
        { label: "no border beyond its end", point: { x: 200, y: 240 }, borders: [] },
    ] as const)("finds $label", ({ point, borders }) => {
        expect(bordersAt(point, TASK)).toEqual(borders);
    });
});

describe("gapBetween", () => {
    it("is the shortest orthogonal distance between two shapes, zero where they overlap", () => {
        expect(gapBetween(TASK, EVENT)).toBe(100);
        expect(gapBetween(TASK, { x: 300, y: 300, width: 10, height: 10 })).toBe(220);
        expect(gapBetween(TASK, { x: 150, y: 150, width: 10, height: 10 })).toBe(0);
    });
});

describe("keepsClearOf", () => {
    it.each([
        { label: "15 px to the right", other: { ...TASK, x: 215 }, clear: true },
        { label: "14 px to the right", other: { ...TASK, x: 214 }, clear: false },
        { label: "15 px below", other: { ...TASK, y: 195 }, clear: true },
        { label: "10 px off each way", other: { ...TASK, x: 210, y: 190 }, clear: false },
        { label: "on top", other: TASK, clear: false },
    ])("a shape $label keeps 15 px clear: $clear", ({ other, clear }) => {
        expect(keepsClearOf(TASK, other, 15)).toBe(clear);
    });
});
