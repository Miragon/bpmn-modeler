import { describe, expect, it } from "vitest";

import { PLANE, layoutOf, node, pool } from "./__fixtures__/layoutShapes";
import { rootPlane } from "./__fixtures__/shapePlane";
import type { DiagramBounds } from "./layoutGeometry";
import type { LaneShape, LayoutModel, LayoutShape } from "./layoutModel";
import { FrameFit, innerBoundsOf } from "./layoutPlacementFrames";
import { ShapeGroups } from "./layoutShapeGroups";

const box = (x: number, y: number, width = 100, height = 80): DiagramBounds => ({
    x,
    y,
    width,
    height,
});

function lane(id: string, bounds: DiagramBounds): LaneShape {
    return {
        kind: "lane",
        id,
        ...rootPlane(PLANE),
        parent: "Process_1",
        pool: "Pool_1",
        outline: "rectangle",
        bounds,
    };
}

function frameFitOf(layout: LayoutModel, id: string, into: readonly LayoutShape[] = []): FrameFit {
    const moving = layout.shapes.get(id);
    if (moving?.kind !== "node") throw new Error(`no node ${id}`);
    return new FrameFit(layout, new ShapeGroups(layout).of(layout, moving), into);
}

describe("innerBoundsOf", () => {
    it("keeps off a wide pool's border and off the name band at its start", () => {
        expect(innerBoundsOf(pool("Pool_1", box(0, 0, 900, 300)))).toEqual(box(40, 10, 850, 280));
    });

    it("keeps off the name band at the top of a frame drawn taller than wide", () => {
        expect(innerBoundsOf(lane("Lane_1", box(0, 0, 200, 600)))).toEqual(box(10, 40, 180, 550));
    });

    it("keeps off a sub-process's border and off the name band at its top", () => {
        const subProcess = node("Sub_1", { expanded: true, bounds: box(100, 100, 400, 200) });

        expect(innerBoundsOf(subProcess)).toEqual(box(110, 130, 380, 160));
    });
});

describe("FrameFit", () => {
    it("keeps a member off the border of a frame it keeps off now", () => {
        const layout = layoutOf([
            pool("Pool_1"),
            node("A", { pool: "Pool_1", bounds: box(100, 100) }),
        ]);
        const fit = frameFitOf(layout, "A");

        expect(fit.fitsMovedBy(0, -80)).toBe(true);
        expect(fit.fitsMovedBy(0, -95)).toBe(false);
    });

    it("lets a member on a frame's border move along it, but not out of the frame", () => {
        const layout = layoutOf([
            pool("Pool_1"),
            node("A", { pool: "Pool_1", bounds: box(100, 0) }),
        ]);
        const fit = frameFitOf(layout, "A");

        expect(fit.fitsMovedBy(10, 0)).toBe(true);
        expect(fit.fitsMovedBy(0, -10)).toBe(false);
    });

    it("brings a member lying partly outside its sub-process no further out of it", () => {
        const layout = layoutOf([
            pool("Pool_1"),
            node("Sub_1", { expanded: true, pool: "Pool_1", bounds: box(0, 0, 400, 200) }),
            node("A", { pool: "Pool_1", subProcesses: ["Sub_1"], bounds: box(350, 50) }),
        ]);
        const fit = frameFitOf(layout, "A");

        expect(fit.fitsMovedBy(0, 0)).toBe(true);
        expect(fit.fitsMovedBy(-10, 0)).toBe(true);
        expect(fit.fitsMovedBy(10, 0)).toBe(false);
    });

    it("does not hold a member in a pool or lane it lies partly outside of now", () => {
        const layout = layoutOf([
            pool("Pool_1"),
            node("A", { pool: "Pool_1", bounds: box(850, 100) }),
        ]);

        expect(frameFitOf(layout, "A").fitsMovedBy(100, 0)).toBe(true);
    });

    it("holds a boundary event on its host, not in the frames", () => {
        const layout = layoutOf([
            pool("Pool_1"),
            node("A", { pool: "Pool_1", bounds: box(100, 200) }),
            node("Boundary_1", { pool: "Pool_1", host: "A", bounds: box(130, 262, 36, 36) }),
        ]);

        expect(frameFitOf(layout, "A").fitsMovedBy(0, 8)).toBe(true);
    });

    it("does not hold a member in a frame that moves with it", () => {
        const layout = layoutOf([
            pool("Pool_1"),
            node("Sub_1", { expanded: true, pool: "Pool_1", bounds: box(100, 50, 300, 200) }),
            node("C", { pool: "Pool_1", subProcesses: ["Sub_1"], bounds: box(150, 100) }),
        ]);

        expect(frameFitOf(layout, "Sub_1").fitsMovedBy(200, 0)).toBe(true);
    });

    it("brings the group's shapes inside the frames it is brought into, off their border and name band", () => {
        const subProcess = node("Sub_1", {
            expanded: true,
            pool: "Pool_1",
            bounds: box(300, 50, 300, 200),
        });
        const layout = layoutOf([
            pool("Pool_1"),
            subProcess,
            node("A", { pool: "Pool_1", subProcesses: ["Sub_1"], bounds: box(100, 100) }),
        ]);
        const fit = frameFitOf(layout, "A", [subProcess]);

        expect(fit.fitsMovedBy(0, 0)).toBe(false);
        expect(fit.fitsMovedBy(220, 0)).toBe(true);
        expect(fit.fitsMovedBy(220, -30)).toBe(false);
    });

    it("lets a node brought into its sub-process leave the lane it lies in now", () => {
        const subProcess = node("Sub_1", {
            expanded: true,
            pool: "Pool_1",
            lanes: ["Lane_2"],
            bounds: box(300, 220, 300, 160),
        });
        const layout = layoutOf([
            pool("Pool_1", box(0, 0, 900, 400)),
            lane("Lane_1", box(30, 0, 870, 200)),
            lane("Lane_2", box(30, 200, 870, 200)),
            subProcess,
            node("A", {
                pool: "Pool_1",
                lanes: ["Lane_1"],
                subProcesses: ["Sub_1"],
                bounds: box(100, 50),
            }),
        ]);

        expect(frameFitOf(layout, "A", [subProcess]).fitsMovedBy(220, 200)).toBe(true);
        expect(frameFitOf(layout, "A").fitsMovedBy(220, 200)).toBe(false);
    });
});
