import { describe, expect, it } from "vitest";

import { box, lane, layoutOf, node, pool } from "../../../__fixtures__/layoutShapes";
import type { LayoutModel, LayoutShape } from "./layoutModel";
import { FrameFit, growthToHold, holdsLevel, innerBoundsOf } from "./layoutPlacementFrames";
import { ShapeGroups } from "./layoutShapeGroups";

const IN_POOL = { pool: "Pool_1" };

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
        expect(innerBoundsOf(lane("Lane_1", box(0, 0, 200, 600), IN_POOL))).toEqual(
            box(10, 40, 180, 550),
        );
    });

    it("keeps off a sub-process's border and off the name band at its top", () => {
        const subProcess = node("Sub_1", { expanded: true, bounds: box(100, 100, 400, 200) });

        expect(innerBoundsOf(subProcess)).toEqual(box(110, 130, 380, 160));
    });
});

describe("holdsLevel", () => {
    const upper = lane("Lane_1", box(30, 0, 1170, 150), IN_POOL);

    it("holds bounds that lie in the lane's band off its border", () => {
        expect(holdsLevel(upper, box(300, 10, 100, 130))).toBe(true);
    });

    it.each([
        ["above the band", box(300, 5)],
        ["below the band", box(300, 100)],
    ])("holds no bounds reaching %s, wherever they lie sideways", (_, bounds) => {
        expect(holdsLevel(upper, bounds)).toBe(false);
    });
});

describe("growthToHold", () => {
    const frame = pool("Pool_1", box(0, 0, 600, 200));

    it("grows no side of a frame that holds the bounds off its border", () => {
        expect(growthToHold([frame], box(100, 60))).toEqual({
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
        });
    });

    it("grows each side the bounds pass, as far as the frame needing most", () => {
        const narrower = lane("Lane_1", box(30, 0, 500, 200), IN_POOL);

        expect(growthToHold([frame, narrower], box(520, 150, 100, 80))).toEqual({
            left: 0,
            right: 100,
            top: 0,
            bottom: 40,
        });
        expect(growthToHold([frame, narrower], box(20, -20))).toEqual({
            left: 50,
            right: 0,
            top: 30,
            bottom: 0,
        });
    });
});

describe("FrameFit", () => {
    it("keeps a member off the border of a frame it keeps off now", () => {
        const layout = layoutOf([
            pool("Pool_1"),
            node("A", { pool: "Pool_1", bounds: box(100, 100) }),
        ]);
        const fit = frameFitOf(layout, "A");

        expect(fit.fitsMovedBy({ dx: 0, dy: -80 })).toBe(true);
        expect(fit.fitsMovedBy({ dx: 0, dy: -95 })).toBe(false);
    });

    it("lets a member on a frame's border move along it, but not out of the frame", () => {
        const layout = layoutOf([
            pool("Pool_1"),
            node("A", { pool: "Pool_1", bounds: box(100, 0) }),
        ]);
        const fit = frameFitOf(layout, "A");

        expect(fit.fitsMovedBy({ dx: 10, dy: 0 })).toBe(true);
        expect(fit.fitsMovedBy({ dx: 0, dy: -10 })).toBe(false);
    });

    it("brings a member lying partly outside its sub-process no further out of it", () => {
        const layout = layoutOf([
            pool("Pool_1"),
            node("Sub_1", { expanded: true, pool: "Pool_1", bounds: box(0, 0, 400, 200) }),
            node("A", { pool: "Pool_1", subProcesses: ["Sub_1"], bounds: box(350, 50) }),
        ]);
        const fit = frameFitOf(layout, "A");

        expect(fit.fitsMovedBy({ dx: 0, dy: 0 })).toBe(true);
        expect(fit.fitsMovedBy({ dx: -10, dy: 0 })).toBe(true);
        expect(fit.fitsMovedBy({ dx: 10, dy: 0 })).toBe(false);
    });

    it("does not hold a member in a pool or lane it lies partly outside of now", () => {
        const layout = layoutOf([
            pool("Pool_1"),
            node("A", { pool: "Pool_1", bounds: box(850, 100) }),
        ]);

        expect(frameFitOf(layout, "A").fitsMovedBy({ dx: 100, dy: 0 })).toBe(true);
    });

    it("holds a boundary event on its host, not in the frames", () => {
        const layout = layoutOf([
            pool("Pool_1"),
            node("A", { pool: "Pool_1", bounds: box(100, 200) }),
            node("Boundary_1", { pool: "Pool_1", host: "A", bounds: box(130, 262, 36, 36) }),
        ]);

        expect(frameFitOf(layout, "A").fitsMovedBy({ dx: 0, dy: 8 })).toBe(true);
    });

    it("does not hold a member in a frame that moves with it", () => {
        const layout = layoutOf([
            pool("Pool_1"),
            node("Sub_1", { expanded: true, pool: "Pool_1", bounds: box(100, 50, 300, 200) }),
            node("C", { pool: "Pool_1", subProcesses: ["Sub_1"], bounds: box(150, 100) }),
        ]);

        expect(frameFitOf(layout, "Sub_1").fitsMovedBy({ dx: 200, dy: 0 })).toBe(true);
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

        expect(fit.fitsMovedBy({ dx: 0, dy: 0 })).toBe(false);
        expect(fit.fitsMovedBy({ dx: 220, dy: 0 })).toBe(true);
        expect(fit.fitsMovedBy({ dx: 220, dy: -30 })).toBe(false);
    });

    it("finds the shortest offset that brings the group's shapes inside the frames it is brought into", () => {
        const subProcess = node("Sub_1", {
            expanded: true,
            pool: "Pool_1",
            bounds: box(300, 50, 300, 200),
        });
        const layout = layoutOf([
            pool("Pool_1"),
            subProcess,
            node("A", { pool: "Pool_1", subProcesses: ["Sub_1"], bounds: box(100, 20) }),
        ]);

        expect(frameFitOf(layout, "A", [subProcess]).offsetInto()).toEqual({ dx: 210, dy: 60 });
    });

    it("keeps the group's shapes where they lie when they lie inside the frames already", () => {
        const subProcess = node("Sub_1", {
            expanded: true,
            pool: "Pool_1",
            bounds: box(300, 50, 300, 200),
        });
        const layout = layoutOf([
            pool("Pool_1"),
            subProcess,
            node("A", { pool: "Pool_1", subProcesses: ["Sub_1"], bounds: box(350, 100) }),
        ]);

        expect(frameFitOf(layout, "A", [subProcess]).offsetInto()).toEqual({ dx: 0, dy: 0 });
    });

    it("finds no offset into frames that leave the group's shapes no room", () => {
        const subProcess = node("Sub_1", {
            expanded: true,
            pool: "Pool_1",
            bounds: box(300, 50, 110, 200),
        });
        const layout = layoutOf([
            pool("Pool_1"),
            subProcess,
            node("A", { pool: "Pool_1", subProcesses: ["Sub_1"], bounds: box(100, 100) }),
        ]);

        expect(frameFitOf(layout, "A", [subProcess]).offsetInto()).toBeUndefined();
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
            lane("Lane_1", box(30, 0, 870, 200), IN_POOL),
            lane("Lane_2", box(30, 200, 870, 200), IN_POOL),
            subProcess,
            node("A", {
                pool: "Pool_1",
                lanes: ["Lane_1"],
                subProcesses: ["Sub_1"],
                bounds: box(100, 50),
            }),
        ]);

        expect(frameFitOf(layout, "A", [subProcess]).fitsMovedBy({ dx: 220, dy: 200 })).toBe(true);
        expect(frameFitOf(layout, "A").fitsMovedBy({ dx: 220, dy: 200 })).toBe(false);
    });
});
