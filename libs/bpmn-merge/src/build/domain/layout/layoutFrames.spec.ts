import { describe, expect, it } from "vitest";

import {
    PLANE,
    box,
    flow,
    lane as buildLane,
    layoutOf,
    node,
    pool,
} from "../../../__fixtures__/layoutShapes";
import { rootPlane } from "../../../__fixtures__/shapePlane";
import {
    carrierIdsOf,
    descendantLanesOf,
    drawnPoolOf,
    frameIdsOf,
    frameScopeOf,
    framesAroundOf,
    holdingPoolOf,
    lanesOf,
    lanesWithoutPoolOn,
    parentLanesOf,
    sharedFrameOf,
    siblingLanesOf,
} from "./layoutFrames";
import type { DiagramBounds } from "./layoutGeometry";
import type { LaneShape, LayoutShape, NodeShape } from "./layoutModel";

describe("sharedFrameOf", () => {
    const aToB = flow("Flow_1", "A", "B");

    it("is the innermost expanded sub-process both ends lie in", () => {
        const layout = layoutOf([
            pool("Pool_1"),
            node("Sub_Outer", { expanded: true, pool: "Pool_1" }),
            node("Sub_Inner", { expanded: true, pool: "Pool_1", subProcesses: ["Sub_Outer"] }),
            node("A", { pool: "Pool_1", subProcesses: ["Sub_Inner", "Sub_Outer"] }),
            node("B", { pool: "Pool_1", subProcesses: ["Sub_Outer"] }),
        ]);

        expect(sharedFrameOf(layout, aToB)?.id).toBe("Sub_Outer");
    });

    it("is the pool when the ends share no sub-process drawn open on the flow's plane", () => {
        const layout = layoutOf([
            pool("Pool_1"),
            node("Sub_1", { pool: "Pool_1" }),
            node("A", { pool: "Pool_1", subProcesses: ["Sub_1"] }),
            node("B", { pool: "Pool_1", subProcesses: ["Sub_1"] }),
        ]);

        expect(sharedFrameOf(layout, aToB)?.id).toBe("Pool_1");
    });

    it("is none for a flow between two pools, or to a pool", () => {
        const twoPools = layoutOf([
            pool("Pool_1"),
            pool("Pool_2"),
            node("A", { pool: "Pool_1" }),
            node("B", { pool: "Pool_2" }),
        ]);
        const toPool = layoutOf([pool("Pool_1"), pool("B"), node("A", { pool: "Pool_1" })]);

        expect(sharedFrameOf(twoPools, aToB)).toBeUndefined();
        expect(sharedFrameOf(toPool, aToB)).toBeUndefined();
    });

    it("leaves out the pool of a data store, which may lie outside it", () => {
        const layout = layoutOf([
            pool("Pool_1"),
            node("A", { pool: "Pool_1" }),
            node("B", { pool: "Pool_1", mayLieOutsidePool: true }),
        ]);

        expect(sharedFrameOf(layout, aToB)).toBeUndefined();
    });
});

describe("framesAroundOf", () => {
    it("lists every frame drawn around the node: its open sub-processes, pool and lanes", () => {
        const lane = buildLane("Lane_1", box(30, 0, 870, 300));
        const layout = layoutOf([
            pool("Pool_1"),
            lane,
            node("Sub_Open", { expanded: true, pool: "Pool_1" }),
            node("Sub_Closed", { pool: "Pool_1" }),
            node("A", {
                pool: "Pool_1",
                lanes: ["Lane_1"],
                subProcesses: ["Sub_Open", "Sub_Closed"],
            }),
        ]);

        expect(
            framesAroundOf(layout, layout.shapes.get("A") as NodeShape).map(({ id }) => id),
        ).toEqual(["Sub_Open", "Pool_1", "Lane_1"]);
    });
});

describe("frameScopeOf", () => {
    const lane = (id: string, parent: string, height: number) =>
        buildLane(id, box(30, 0, 870, height), { parent, pool: "Pool_1" });

    it("finds the lane no other lane of the node is nested in, even of the same height as its parent", () => {
        const layout = layoutOf([
            pool("Pool_1"),
            lane("Lane_Parent", "Process_1", 300),
            lane("Lane_Child", "Lane_Parent", 300),
            node("A", { pool: "Pool_1", lanes: ["Lane_Parent", "Lane_Child"] }),
        ]);
        const inLanes = layout.shapes.get("A") as NodeShape;

        expect(frameScopeOf(layout, inLanes)).toEqual({
            container: layout.shapes.get("Pool_1"),
            lane: layout.shapes.get("Lane_Child"),
        });
    });

    it("finds the open sub-process around the node and no lane", () => {
        const layout = layoutOf([
            pool("Pool_1"),
            lane("Lane_1", "Process_1", 300),
            node("Sub_1", { expanded: true, pool: "Pool_1", lanes: ["Lane_1"] }),
            node("A", { pool: "Pool_1", lanes: ["Lane_1"], subProcesses: ["Sub_1"] }),
        ]);
        const inSub = layout.shapes.get("A") as NodeShape;

        expect(frameScopeOf(layout, inSub)).toEqual({
            container: layout.shapes.get("Sub_1"),
            lane: undefined,
        });
    });
});

describe("drawnPoolOf", () => {
    it.each([
        ["the pool drawn on the node's plane", pool("Pool_1"), {}, "Pool_1"],
        [
            "none for a pool drawn on another plane",
            { ...pool("Pool_1"), plane: "Other" },
            {},
            undefined,
        ],
        [
            "none for a data store, which may lie outside it",
            pool("Pool_1"),
            { mayLieOutsidePool: true },
            undefined,
        ],
        ["none for a node outside every pool", pool("Pool_1"), { pool: undefined }, undefined],
    ])("is %s", (_, drawnPool, relations, expected) => {
        const task = node("Task_A", { pool: "Pool_1", ...relations });

        expect(drawnPoolOf(layoutOf([drawnPool, task]), task)?.id).toBe(expected);
    });
});

describe("holdingPoolOf", () => {
    const inside = { x: 100, y: 100, width: 50, height: 50 };
    const outside = { x: 1000, y: 100, width: 50, height: 50 };

    it.each([
        ["its drawn pool, wherever it lies", { pool: "Pool_1", bounds: outside }, "Pool_1"],
        [
            "the pool a data store lies within",
            { pool: "Pool_2", mayLieOutsidePool: true, bounds: inside },
            "Pool_1",
        ],
        ["the pool an artifact of the collaboration lies within", { bounds: inside }, "Pool_1"],
        [
            "none for a data store outside every pool",
            { pool: "Pool_1", mayLieOutsidePool: true, bounds: outside },
            undefined,
        ],
    ])("is %s", (_, relations, expected) => {
        const shape = node("Shape_A", relations);
        const layout = layoutOf([pool("Pool_1"), pool("Pool_2", { ...outside, x: 2000 }), shape]);

        expect(holdingPoolOf(layout, shape)?.id).toBe(expected);
    });
});

describe("frameIdsOf", () => {
    it.each([
        {
            label: "its innermost sub-process, which stands for its pool and lanes",
            relations: { subProcesses: ["Sub_1", "Sub_0"], pool: "Pool_1", lanes: ["Lane_1"] },
            frames: ["Sub_1"],
        },
        {
            label: "its pool and lanes outside a sub-process",
            relations: { pool: "Pool_1", lanes: ["Lane_1", "Lane_2"] },
            frames: ["Pool_1", "Lane_1", "Lane_2"],
        },
        {
            label: "nothing for a data store, which may lie outside its pool",
            relations: { pool: "Pool_1", lanes: ["Lane_1"], mayLieOutsidePool: true },
            frames: [],
        },
    ])("names $label", ({ relations, frames }) => {
        expect(frameIdsOf(node("Task_1", relations))).toEqual(frames);
    });
});

describe("carrierIdsOf", () => {
    const lane = (id: string, parent: string, poolId?: string) =>
        buildLane(id, box(30, 0, 870, 300), {
            parent,
            ...(poolId === undefined ? {} : { pool: poolId }),
        });

    it.each<[string, LayoutShape, string[]]>([
        [
            "a top lane's process and pool",
            lane("Lane_1", "Process_1", "Pool_1"),
            ["Process_1", "Pool_1"],
        ],
        [
            "a child lane's parent lane and pool",
            lane("Lane_2", "Lane_1", "Pool_1"),
            ["Lane_1", "Pool_1"],
        ],
        [
            "only the parent of a lane drawn without a pool",
            lane("Lane_3", "Process_1"),
            ["Process_1"],
        ],
        ["nothing for a pool", pool("Pool_1"), []],
    ])("names %s", (_, frame, carriers) => {
        expect(carrierIdsOf(frame)).toEqual(carriers);
    });
});

describe("lanesOf", () => {
    const lane = (id: string, bounds: DiagramBounds, plane = PLANE, inPool = "Pool_1") =>
        buildLane(id, bounds, { ...rootPlane(plane), pool: inPool });

    it("lists the lanes drawn inside the pool on its plane, in document order", () => {
        const own = [
            lane("Lane_1", { x: 30, y: 0, width: 870, height: 150 }),
            lane("Lane_2", { x: 30, y: 150, width: 870, height: 150 }),
        ];
        const layout = layoutOf([
            pool("Pool_1"),
            ...own,
            pool("Pool_2", { x: 0, y: 400, width: 900, height: 200 }),
            lane("Lane_Other", { x: 30, y: 400, width: 870, height: 200 }, PLANE, "Pool_2"),
            lane("Lane_Elsewhere", { x: 30, y: 0, width: 870, height: 150 }, "Sub_1"),
        ]);

        expect(lanesOf(layout, layout.shapes.get("Pool_1")!)).toEqual(own);
    });

    it("lists a lane of the pool's process drawn outside the pool, and no other pool's lane drawn inside it", () => {
        const below = lane("Lane_Below", { x: 30, y: 300, width: 870, height: 120 });
        const layout = layoutOf([
            pool("Pool_1"),
            lane("Lane_1", { x: 30, y: 0, width: 870, height: 300 }),
            below,
            lane("Lane_Stray", { x: 30, y: 100, width: 870, height: 100 }, PLANE, "Pool_2"),
        ]);

        expect(lanesOf(layout, layout.shapes.get("Pool_1")!).map(({ id }) => id)).toEqual([
            "Lane_1",
            "Lane_Below",
        ]);
    });
});

describe("the lane tree", () => {
    const lane = (id: string, parent: string, { plane = PLANE, inPool = true } = {}) =>
        buildLane(id, box(30, 0, 870, 100), {
            ...rootPlane(plane),
            parent,
            ...(inPool ? { pool: "Pool_1" } : {}),
        });
    const top = lane("Lane_Top", "Process_1");
    const beside = lane("Lane_Beside", "Process_1");
    const child = lane("Lane_Child", "Lane_Top");
    const grandchild = lane("Lane_Grandchild", "Lane_Child");
    const elsewhere = lane("Lane_Elsewhere", "Process_1", { plane: "Sub_1" });
    const layout = layoutOf([pool("Pool_1"), top, child, beside, grandchild, elsewhere]);

    it("names a lane's parent lanes from the innermost, not its process", () => {
        expect(parentLanesOf(layout, grandchild)).toEqual(["Lane_Child", "Lane_Top"]);
        expect(parentLanesOf(layout, top)).toEqual([]);
    });

    it("stops at a parent cycle", () => {
        const looped = layoutOf([lane("Lane_A", "Lane_B"), lane("Lane_B", "Lane_A")]);

        expect(parentLanesOf(looped, looped.shapes.get("Lane_A") as LaneShape)).toEqual([
            "Lane_B",
            "Lane_A",
        ]);
    });

    it("lists the lanes inside a lane at any depth on its plane, in document order", () => {
        expect(descendantLanesOf(layout, top)).toEqual([child, grandchild]);
        expect(descendantLanesOf(layout, grandchild)).toEqual([]);
    });

    it("lists the other lanes with the lane's parent on its plane", () => {
        expect(siblingLanesOf(layout, top)).toEqual([beside]);
        expect(siblingLanesOf(layout, child)).toEqual([]);
    });

    it("lists the lanes drawn without a pool on a plane", () => {
        const loose = lane("Lane_Loose", "Process_2", { inPool: false });
        const looseElsewhere = lane("Lane_Loose_Sub", "Process_2", {
            plane: "Sub_1",
            inPool: false,
        });
        const mixed = layoutOf([pool("Pool_1"), top, loose, looseElsewhere]);

        expect(lanesWithoutPoolOn(mixed, PLANE)).toEqual([loose]);
    });
});
