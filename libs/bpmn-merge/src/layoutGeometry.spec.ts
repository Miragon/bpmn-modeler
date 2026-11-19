import { describe, expect, it } from "vitest";

import {
    type DiagramBounds,
    bordersAt,
    gapBetween,
    keepsClearOf,
    segmentEntersOutline,
    sideOfCenter,
    spansAlong,
} from "./layoutGeometry";

const TASK: DiagramBounds = { x: 100, y: 100, width: 100, height: 80 };
const EVENT: DiagramBounds = { x: 300, y: 140, width: 36, height: 36 };

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
