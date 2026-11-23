import { describe, expect, it } from "vitest";

import {
    type DiagramBox,
    FlowCardTarget,
    type MergeCardView,
    ShapeCardTarget,
} from "./mergeCardTarget";

const CARD = { width: 240, height: 90 };

// A task of 100 × 80 at (200, 100).
const task = (below: readonly DiagramBox[] = []) =>
    new ShapeCardTarget({ x: 200, y: 100, width: 100, height: 80 }, below);

const view = (overrides: Partial<MergeCardView> = {}): MergeCardView => ({
    scale: 1,
    card: CARD,
    ...overrides,
});

describe("the card's place", () => {
    describe("on a shape", () => {
        it("goes below the shape, from its left edge, its arrow at the shape's middle", () => {
            expect(task().placeCard(view())).toStrictEqual({
                left: 0,
                top: 90,
                arrowLeft: 50,
            });
        });

        it("goes below the shape's external label and its boundary events", () => {
            const label = { x: 180, y: 190, width: 140, height: 28 };
            const boundaryEvent = { x: 260, y: 162, width: 36, height: 36 };

            expect(task([boundaryEvent, label]).placeCard(view()).top).toBe(128);
        });

        it("goes below the pad where the pad reaches lower, as the card would reach under it", () => {
            // The pad sits 8 px right of the shape, at its top, and is 160 px high.
            expect(task().placeCard(view({ pad: { width: 30, height: 160 } })).top).toBe(170);
        });

        it("stays below the shape where the pad starts past the card's right edge", () => {
            const narrow = view({
                card: { width: 100, height: 60 },
                pad: { width: 30, height: 160 },
            });

            expect(task().placeCard(narrow).top).toBe(90);
        });

        it("keeps its size in pixels and scales the diagram's distances with the zoom", () => {
            expect(
                task().placeCard(view({ scale: 2, pad: { width: 30, height: 120 } })),
            ).toStrictEqual({ left: 0, top: 170, arrowLeft: 100 });
        });

        it("keeps its arrow off the card's corners on a narrow shape", () => {
            const event = new ShapeCardTarget({ x: 0, y: 0, width: 20, height: 20 });

            expect(event.placeCard(view()).arrowLeft).toBe(16);
        });
    });

    describe("on a flow", () => {
        // Right from (100, 300) to (300, 300), then down to (300, 400): 300 long, its middle at (250, 300).
        const waypoints = [
            { x: 100, y: 300 },
            { x: 300, y: 300 },
            { x: 300, y: 400 },
        ];

        it("goes below the middle of the flow, centred on it", () => {
            expect(new FlowCardTarget(waypoints).placeCard(view())).toStrictEqual({
                left: 150 - 120,
                top: 10,
                arrowLeft: 120,
            });
        });

        it("goes below the flow's label", () => {
            const label = { x: 150, y: 270, width: 60, height: 20 };

            expect(new FlowCardTarget(waypoints, label).placeCard(view())).toStrictEqual({
                left: 80 - 120,
                top: 0,
                arrowLeft: 120,
            });
        });

        it("stays centred below the flow while its pad is open, since the pad opens above it", () => {
            const short = [
                { x: 100, y: 300 },
                { x: 200, y: 300 },
            ];

            expect(
                new FlowCardTarget(short).placeCard(view({ pad: { width: 30, height: 100 } })),
            ).toStrictEqual({ left: 50 - 120, top: 10, arrowLeft: 120 });
        });
    });
});

describe("the card's anchor", () => {
    it("is a shape's top left corner", () => {
        expect(task().anchor).toStrictEqual({ x: 200, y: 100 });
    });

    it("is the top left corner of a flow's waypoints' box", () => {
        expect(
            new FlowCardTarget([
                { x: 300, y: 120 },
                { x: 300, y: 40 },
                { x: 150, y: 40 },
            ]).anchor,
        ).toStrictEqual({ x: 150, y: 40 });
    });
});

describe("the scroll that fits the card", () => {
    // The task's top is 100 in the diagram; `y` puts it `elementTop` pixels below the pane's top.
    it.each<[string, { elementTop: number; cardEnd: number; scale?: number }, number]>([
        ["nothing where the card fits", { elementTop: 300, cardEnd: 200 }, 0],
        ["the card's overflow and a margin", { elementTop: 300, cardEnd: 520 }, 36],
        ["no further than keeps the element in sight", { elementTop: 116, cardEnd: 1084 }, 100],
        ["nothing where the element is at the top", { elementTop: 10, cardEnd: 890 }, 0],
        ["at the zoom the diagram shows", { elementTop: 300, cardEnd: 520, scale: 2 }, 36],
    ])("scrolls %s", (_case, { elementTop, cardEnd, scale = 1 }, scroll) => {
        expect(
            task().scrollToFit(
                { top: cardEnd - 90, height: 90 },
                { y: 100 - elementTop / scale, scale, height: 800 },
            ),
        ).toBe(scroll);
    });
});
