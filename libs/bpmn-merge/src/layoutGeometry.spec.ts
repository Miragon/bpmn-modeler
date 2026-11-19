import { describe, expect, it } from "vitest";

import {
    type DiagramBounds,
    areaOutside,
    bordersAt,
    gapBetween,
    keepsClearOf,
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
