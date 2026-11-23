import { describe, expect, it } from "vitest";

import { isCanvasSized, isUsableViewbox } from "./canvasSize";

describe("isUsableViewbox", () => {
    it.each([
        ["a plain box", { x: 0, y: 0, width: 800, height: 600 }, true],
        ["negative origins", { x: -100, y: -50, width: 800, height: 600 }, true],
        ["undefined", undefined, false],
        // The shape a persisted NaN viewbox comes back in after JSON.
        ["null members", { x: null, y: null, width: null, height: null }, false],
        ["NaN members", { x: NaN, y: NaN, width: NaN, height: NaN }, false],
        ["an infinite scale", { x: 0, y: 0, width: Infinity, height: Infinity }, false],
        ["zero area", { x: 0, y: 0, width: 0, height: 0 }, false],
        ["a negative extent", { x: 0, y: 0, width: -800, height: 600 }, false],
    ])("returns %s -> %s", (_case, viewbox, expected) => {
        // Cases deliberately include malformed viewboxes (null/NaN members) the
        // typed parameter rejects, so coerce through `unknown`.
        expect(isUsableViewbox(viewbox as unknown as Parameters<typeof isUsableViewbox>[0])).toBe(
            expected,
        );
    });
});

describe("isCanvasSized", () => {
    it.each([
        [{ width: 0, height: 0 }, false],
        [{ width: 1, height: 1 }, false],
        [{ width: 1200, height: 8 }, false],
        [{ width: 1000, height: 800 }, true],
    ])("reports %o as sized: %s", (outer, sized) => {
        const canvas = { viewbox: () => ({ outer }) };

        expect(isCanvasSized(canvas)).toBe(sized);
    });
});
