import { describe, expect, it } from "vitest";
import { positionFormPreview } from "./formPreviewPosition";

const canvas = { x: 20, y: 30, width: 1000, height: 700 };
describe("adjacent preview placement", () => {
    it.each([
        { task: { x: 200, y: 200, width: 100, height: 80 }, contextPad: undefined, left: 312 },
        {
            task: { x: 200, y: 200, width: 100, height: 80 },
            contextPad: { x: 310, y: 180, width: 80, height: 150 },
            left: 402,
        },
        {
            task: { x: 200, y: 200, width: 200, height: 160 },
            contextPad: { x: 410, y: 180, width: 80, height: 150 },
            left: 502,
        },
    ])(
        "sits right of the rendered task and context pad at any zoom ($left)",
        ({ task, contextPad, left }) => {
            expect(positionFormPreview({ canvas, task, contextPad }, 320, 300)).toEqual({
                left,
                top: 200,
                width: 320,
                maxHeight: 300,
            });
        },
    );
    it.each([
        { x: 850, y: 200, left: 692, top: 200 },
        { x: 1400, y: 900, left: 692, top: 422 },
        { x: -500, y: -100, left: 28, top: 38 },
    ])(
        "clamps at the viewport rather than searching another side ($x, $y)",
        ({ x, y, left, top }) => {
            expect(
                positionFormPreview({ canvas, task: { x, y, width: 100, height: 80 } }, 320, 300),
            ).toEqual({ left, top, width: 320, maxHeight: 300 });
        },
    );
    it.each([
        { width: 280, height: 600, edge: 8 },
        { width: 200, height: 120, edge: 8 },
        { width: 12, height: 12, edge: 3 },
    ])(
        "keeps a bounded visible preview on a $width by $height viewport even when it overlaps",
        ({ width, height, edge }) => {
            const position = positionFormPreview(
                {
                    canvas: { x: 10, y: 20, width, height },
                    task: { x: 100, y: 100, width: 100, height: 80 },
                },
                340,
                700,
            );
            expect(position).toEqual({
                left: 10 + edge,
                top: 20 + edge,
                width: width - 2 * edge,
                maxHeight: height - 2 * edge,
            });
        },
    );
});
