import { describe, expect, it } from "vitest";
import {
    collectPreviewObstacles,
    previewNeighborhood,
    type PreviewElement,
} from "./collectPreviewObstacles";

const bounds = { x: 50, y: 60, width: 800, height: 600 };
const toViewport = (box: typeof bounds) => ({
    x: box.x * 2 + 50,
    y: box.y * 2 + 60,
    width: box.width * 2,
    height: box.height * 2,
});
const shape = (parent?: PreviewElement, x = 100): PreviewElement => ({
    parent,
    x,
    y: 100,
    width: 100,
    height: 80,
});
describe("preview obstacles", () => {
    it("ignores faraway nodes even when they are still inside a large viewport", () => {
        const root = {};
        const target = { ...shape(root), x: 1000, y: 1000, width: 100, height: 80 };
        const near = { ...shape(root), x: 1300, y: 1000 };
        const far = { ...shape(root), x: 3000, y: 1000 };
        const viewport = { x: 0, y: 0, width: 10000, height: 10000 };
        expect(
            collectPreviewObstacles(
                [near, far],
                target,
                ({ x, y, width, height }) => ({ x, y, width, height }),
                previewNeighborhood(viewport, target),
            ),
        ).toEqual([{ x: 1300, y: 1000, width: 100, height: 80 }]);
    });
    it.each([100, -10000, 10000])(
        "bounds the search near a task at x=%s, including offscreen anchors",
        (x) => {
            const canvas = { x: 50, y: 60, width: 10000, height: 8000 };
            const neighborhood = previewNeighborhood(canvas, {
                x,
                y: 2000,
                width: 100,
                height: 80,
            });
            expect(neighborhood.x).toBeGreaterThanOrEqual(canvas.x);
            expect(neighborhood.x + neighborhood.width).toBeLessThanOrEqual(
                canvas.x + canvas.width,
            );
            expect(neighborhood.width).toBeLessThanOrEqual(1500);
            expect(neighborhood.height).toBe(1480);
        },
    );
    it("transforms nearby nodes and labels, excluding target, ancestors and inactive roots", () => {
        const root = {};
        const target = shape(root);
        const neighbor = shape(root, 250);
        expect(
            collectPreviewObstacles(
                [root, target, neighbor, shape({})],
                target,
                toViewport,
                bounds,
            ),
        ).toEqual([toViewport(neighbor as typeof bounds)]);
    });
    it.each(["self", "ancestor"])("excludes a hidden %s", (hidden) => {
        const root = {};
        const parent = { parent: root, hidden: hidden === "ancestor" };
        const node = { ...shape(parent), hidden: hidden === "self" };
        expect(collectPreviewObstacles([node], shape(root), toViewport, bounds)).toEqual([]);
    });
    it("ignores a containing sibling lane but retains other lanes", () => {
        const root = {};
        const lane = (x: number) => ({
            ...shape(root, x),
            businessObject: {
                get: () => undefined,
                $instanceOf: (type: string) => type === "bpmn:Lane",
            },
        });
        expect(
            collectPreviewObstacles([lane(100), lane(250)], shape(root), toViewport, bounds),
        ).toEqual([toViewport(lane(250) as typeof bounds)]);
    });
    it("keeps narrow boxes for bent connection segments", () => {
        const root = {};
        expect(
            collectPreviewObstacles(
                [
                    {
                        parent: root,
                        waypoints: [
                            { x: 100, y: 100 },
                            { x: 200, y: 100 },
                            { x: 200, y: 250 },
                        ],
                    },
                ],
                shape(root),
                toViewport,
                bounds,
            ),
        ).toEqual([
            toViewport({ x: 98, y: 98, width: 104, height: 4 }),
            toViewport({ x: 198, y: 98, width: 4, height: 154 }),
        ]);
    });
    it("discards 1000 distant shapes before ancestry work", () => {
        let ancestryReads = 0;
        const root = {};
        const distant = Array.from({ length: 1000 }, () => ({
            ...shape(root, 10000),
            get parent() {
                ancestryReads++;
                return root;
            },
        }));
        expect(collectPreviewObstacles(distant, shape(root), toViewport, bounds)).toEqual([]);
        expect(ancestryReads).toBe(0);
    });
    it("includes boundary-crossing segments but discards distant segments", () => {
        const root = {};
        expect(
            collectPreviewObstacles(
                [
                    {
                        parent: root,
                        waypoints: [
                            { x: -10000, y: 100 },
                            { x: 10000, y: 100 },
                            { x: 10000, y: 10000 },
                        ],
                    },
                ],
                shape(root),
                toViewport,
                bounds,
            ),
        ).toEqual([toViewport({ x: -10002, y: 98, width: 20004, height: 4 })]);
    });
});
