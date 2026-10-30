import { describe, expect, it } from "vitest";
import { positionFormPreview } from "./formPreviewPosition";

const canvas = { x: 20, y: 30, width: 1000, height: 700 };
describe("anchored preview placement", () => {
    it("rejects a constrained preview that cannot fit its chrome and usable content viewport", () => {
        expect(
            positionFormPreview(
                {
                    canvas: { x: 0, y: 0, width: 500, height: 300 },
                    task: { x: 100, y: 60, width: 100, height: 80 },
                    contextPad: { x: 210, y: 50, width: 80, height: 150 },
                    obstacles: [{ x: 320, y: 60, width: 100, height: 80 }],
                },
                340,
                500,
                200,
            ),
        ).toBeUndefined();
    });
    it("keeps a constrained scrollable preview in a dense diagram without covering its successor", () => {
        const position = positionFormPreview(
            {
                canvas: { x: 0, y: 0, width: 600, height: 420 },
                task: { x: 100, y: 100, width: 100, height: 80 },
                contextPad: { x: 210, y: 90, width: 80, height: 150 },
                obstacles: [{ x: 320, y: 100, width: 100, height: 80 }],
            },
            340,
            500,
        )!;
        expect(position).toBeDefined();
        expect(position.maxHeight).toBeGreaterThanOrEqual(80);
        expect(position.maxHeight).toBeLessThan(500);
        expect(position.top).toBeGreaterThanOrEqual(240);
        expect(position.top + position.maxHeight).toBeLessThanOrEqual(412);
    });
    it("does not cover neighboring tasks, labels or flow segments after clamping", () => {
        const obstacles = [
            { x: 400, y: 200, width: 100, height: 80 },
            { x: 600, y: 200, width: 100, height: 80 },
            { x: 300, y: 238, width: 300, height: 4 },
        ];
        const position = positionFormPreview(
            { canvas, task: { x: 200, y: 200, width: 100, height: 80 }, obstacles },
            340,
            400,
        )!;
        expect(position).toBeDefined();
        for (const box of obstacles) {
            expect(
                position.left + position.width <= box.x ||
                    position.left >= box.x + box.width ||
                    position.top + position.maxHeight <= box.y ||
                    position.top >= box.y + box.height,
            ).toBe(true);
        }
    });
    it("checks collisions after clamping an offscreen anchor", () => {
        const position = positionFormPreview(
            {
                canvas,
                task: { x: 1400, y: 200, width: 100, height: 80 },
                obstacles: [{ x: 700, y: 200, width: 100, height: 80 }],
            },
            340,
            300,
        )!;
        expect(position).toBeDefined();
        expect(
            position.top >= 280 ||
                position.top + position.maxHeight <= 200 ||
                position.left + position.width <= 700,
        ).toBe(true);
    });
    it("sits to the right of both the task and its action pad", () => {
        expect(
            positionFormPreview(
                {
                    canvas,
                    task: { x: 200, y: 200, width: 100, height: 80 },
                    contextPad: { x: 310, y: 180, width: 80, height: 150 },
                },
                320,
                300,
            ),
        ).toEqual({ left: 402, top: 200, width: 320, maxHeight: 300 });
    });
    it("flips left near the right edge", () => {
        expect(
            positionFormPreview(
                { canvas, task: { x: 850, y: 200, width: 100, height: 80 } },
                320,
                300,
            )?.left,
        ).toBe(518);
    });
    it.each([
        { x: 1400, expectedLeft: 672 },
        { x: -500, expectedLeft: 28 },
    ])(
        "keeps the preview and close control inside the canvas when a task pans beyond x=$x",
        ({ x, expectedLeft }) => {
            const position = positionFormPreview(
                {
                    canvas,
                    task: { x, y: 200, width: 100, height: 80 },
                    contextPad: { x: x + 110, y: 180, width: 80, height: 150 },
                },
                340,
                300,
            )!;
            expect(position.left).toBe(expectedLeft);
            expect(position.left).toBeGreaterThanOrEqual(canvas.x + 8);
            expect(position.left + position.width).toBeLessThanOrEqual(canvas.x + canvas.width - 8);
        },
    );
    it("uses vertical free space on a narrow canvas without covering actions", () => {
        const position = positionFormPreview(
            {
                canvas: { x: 0, y: 0, width: 500, height: 700 },
                task: { x: 200, y: 200, width: 100, height: 80 },
                contextPad: { x: 310, y: 180, width: 80, height: 150 },
            },
            320,
            400,
        )!;
        expect(position.top).toBe(342);
        expect(position.left + position.width).toBeLessThanOrEqual(492);
        expect(position.top + position.maxHeight).toBeLessThanOrEqual(692);
    });
    it("clamps the top and width to canvas bounds", () => {
        const position = positionFormPreview(
            { canvas, task: { x: 220, y: -100, width: 100, height: 80 } },
            320,
            300,
        )!;
        expect(position.top).toBe(38);
    });
    it("uses space above a task near the bottom and clamps panel width on small canvases", () => {
        const position = positionFormPreview(
            {
                canvas: { x: 10, y: 20, width: 280, height: 600 },
                task: { x: 150, y: 550, width: 100, height: 60 },
            },
            340,
            400,
        )!;
        expect(position.width).toBe(264);
        expect(position.left).toBe(18);
        expect(position.top + position.maxHeight).toBe(538);
    });
    it("hides when no usable space remains rather than covering the task or actions", () => {
        expect(
            positionFormPreview(
                {
                    canvas: { x: 0, y: 0, width: 200, height: 120 },
                    task: { x: 50, y: 30, width: 100, height: 80 },
                },
                340,
                400,
            ),
        ).toBeUndefined();
    });
});
