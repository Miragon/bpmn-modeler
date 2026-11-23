import { polylineSegments } from "@miragon/bpmn-modeler-types/domain";
import { describe, expect, it } from "vitest";

import { type DiagramBounds, type Outline, outlineMissOf } from "./layoutGeometry";
import { type RouteEnd, routeOrthogonal } from "./layoutRouter";
import { segmentEntersBounds } from "./layoutSegments";

const task = (x: number, y: number): RouteEnd => ({
    bounds: { x, y, width: 100, height: 80 },
    outline: "rectangle",
});
const event = (x: number, y: number): RouteEnd => ({
    bounds: { x, y, width: 36, height: 36 },
    outline: "circle",
});
const gateway = (x: number, y: number): RouteEnd => ({
    bounds: { x, y, width: 50, height: 50 },
    outline: "diamond",
});

function isOrthogonal(points: readonly { x: number; y: number }[]): boolean {
    return polylineSegments(points).every(({ from, to }) => from.x === to.x || from.y === to.y);
}

function meetsOutline(
    point: { x: number; y: number },
    bounds: DiagramBounds,
    outline: Outline,
): boolean {
    return outlineMissOf(point, bounds, outline) === undefined;
}

describe("routeOrthogonal", () => {
    it("keeps a route inside its frame, around an obstacle with little room to it", () => {
        const frame = { x: 0, y: 0, width: 600, height: 200 };
        const route = routeOrthogonal({
            source: task(50, 60),
            target: task(450, 60),
            obstacles: [{ x: 250, y: 10, width: 100, height: 180 }],
            otherSegments: [],
            frame,
        });

        expect(route).toBeDefined();
        for (const { y } of route!) {
            expect(y).toBeGreaterThan(frame.y);
            expect(y).toBeLessThan(frame.y + frame.height);
        }
    });

    it("draws one straight segment between two shapes on one line", () => {
        expect(
            routeOrthogonal({
                source: task(100, 100),
                target: task(300, 100),
                obstacles: [],
                otherSegments: [],
            }),
        ).toEqual([
            { x: 200, y: 140 },
            { x: 300, y: 140 },
        ]);
    });

    it.each<{ name: string; source: RouteEnd; target: RouteEnd }>([
        { name: "a circle", source: event(100, 300), target: task(300, 100) },
        { name: "a diamond", source: gateway(100, 300), target: task(300, 100) },
        { name: "a rectangle", source: task(100, 300), target: event(400, 100) },
    ])("docks on $name's outline with orthogonal segments", ({ source, target }) => {
        const route = routeOrthogonal({ source, target, obstacles: [], otherSegments: [] })!;

        expect(isOrthogonal(route)).toBe(true);
        expect(meetsOutline(route[0]!, source.bounds, source.outline)).toBe(true);
        expect(meetsOutline(route[route.length - 1]!, target.bounds, target.outline)).toBe(true);
    });

    it("passes through an end's clearance to a port beyond it", () => {
        expect(
            routeOrthogonal({
                source: gateway(415, 75),
                target: task(560, 130),
                obstacles: [],
                otherSegments: [{ from: { x: 440, y: 125 }, to: { x: 440, y: 300 } }],
            }),
        ).toEqual([
            { x: 465, y: 100 },
            { x: 610, y: 100 },
            { x: 610, y: 130 },
        ]);
    });

    it("goes around a shape between the ends", () => {
        const obstacle = { x: 240, y: 110, width: 40, height: 60 };
        const route = routeOrthogonal({
            source: task(100, 100),
            target: task(400, 100),
            obstacles: [obstacle],
            otherSegments: [],
        })!;

        expect(isOrthogonal(route)).toBe(true);
        expect(
            polylineSegments(route).some((segment) => segmentEntersBounds(segment, obstacle)),
        ).toBe(false);
    });

    it("prefers a route that crosses no other flow when one is as short", () => {
        const route = routeOrthogonal({
            source: task(100, 100),
            target: task(400, 100),
            obstacles: [{ x: 240, y: 90, width: 40, height: 100 }],
            otherSegments: [{ from: { x: 260, y: 0 }, to: { x: 260, y: 90 } }],
        })!;

        expect(Math.max(...route.map(({ y }) => y))).toBeGreaterThan(190);
    });

    it("gives the same route on every run", () => {
        const request = {
            source: gateway(100, 300),
            target: task(400, 100),
            obstacles: [{ x: 250, y: 200, width: 60, height: 60 }],
            otherSegments: [],
        };

        expect(routeOrthogonal(request)).toEqual(routeOrthogonal(request));
    });

    it("finds no route from a shape another one covers", () => {
        expect(
            routeOrthogonal({
                source: task(100, 100),
                target: task(400, 100),
                obstacles: [{ x: 100, y: 100, width: 100, height: 80 }],
                otherSegments: [],
            }),
        ).toBeUndefined();
    });

    it("finds no route to a shape walled in by others", () => {
        const target = task(400, 100);
        const walls = [
            { x: 380, y: 60, width: 140, height: 30 },
            { x: 380, y: 190, width: 140, height: 30 },
            { x: 360, y: 60, width: 30, height: 160 },
            { x: 510, y: 60, width: 30, height: 160 },
        ];

        expect(
            routeOrthogonal({
                source: task(100, 100),
                target,
                obstacles: walls,
                otherSegments: [],
            }),
        ).toBeUndefined();
    });
});
