import { describe, expect, it } from "vitest";

import { clampToCanvas, hoverCardPosition } from "./positioning";

describe("clampToCanvas", () => {
    const panel = { width: 300, height: 200 };
    const canvas = { left: 0, top: 0, right: 1000, bottom: 800 };

    it.each([
        ["inside the canvas", { x: 100, y: 120 }, { left: 100, top: 120 }],
        ["past the right edge", { x: 900, y: 120 }, { left: 692, top: 120 }],
        ["past the bottom edge", { x: 100, y: 700 }, { left: 100, top: 592 }],
        ["before the top-left corner", { x: -40, y: -10 }, { left: 8, top: 8 }],
    ])("keeps a panel anchored %s on the canvas", (_case, anchor, expected) => {
        expect(clampToCanvas(anchor, panel, canvas)).toEqual(expected);
    });

    it("keeps a panel anchored before an offset canvas's top-left corner on the canvas", () => {
        const offsetCanvas = { left: 400, top: 60, right: 1400, bottom: 860 };

        expect(clampToCanvas({ x: 380, y: 40 }, panel, offsetCanvas)).toEqual({
            left: 408,
            top: 68,
        });
    });

    it("lets a panel wider than an offset canvas overhang its left edge, not the viewport", () => {
        const narrowCanvas = { left: 600, top: 0, right: 1000, bottom: 800 };

        expect(
            clampToCanvas({ x: 700, y: 100 }, { width: 540, height: 200 }, narrowCanvas),
        ).toEqual({ left: 452, top: 100 });
    });

    it("pins a panel larger than the canvas to the top-left margin", () => {
        expect(clampToCanvas({ x: 50, y: 50 }, { width: 1200, height: 900 }, canvas)).toEqual({
            left: 8,
            top: 8,
        });
    });
});

describe("hoverCardPosition", () => {
    const viewport = { width: 1400, height: 900 };
    const panel = { panelLeft: 600 };

    it("opens left of the panel, aligned with the hovered card", () => {
        expect(hoverCardPosition({ ...panel, cardTop: 240 }, viewport)).toEqual({
            left: 292,
            top: 240,
            maxHeight: 652,
        });
    });

    it("stays on-screen when the panel sits against the left edge", () => {
        expect(hoverCardPosition({ panelLeft: 150, cardTop: 240 }, viewport).left).toBe(8);
    });

    it("opens right of a panel too close to the left edge when allowed to", () => {
        expect(
            hoverCardPosition({ panelLeft: 150, panelRight: 470, cardTop: 240 }, viewport).left,
        ).toBe(478);
    });

    it("stays on-screen when neither side of the panel fits the card", () => {
        expect(
            hoverCardPosition(
                { panelLeft: 100, panelRight: 640, cardTop: 240 },
                { ...viewport, width: 900 },
            ).left,
        ).toBe(8);
    });

    it.each([
        ["above the viewport", -50, 8],
        ["near the viewport bottom", 850, 700],
    ])("clamps a card scrolled %s", (_case, cardTop, top) => {
        expect(hoverCardPosition({ ...panel, cardTop }, viewport)).toMatchObject({
            top,
            maxHeight: viewport.height - top - 8,
        });
    });
});
