import { describe, expect, it } from "vitest";

import { rootPlane, subProcessPlane } from "./__fixtures__/shapePlane";
import type { DiagramBounds } from "./layoutGeometry";
import {
    type LayoutEdge,
    type LayoutModel,
    type LayoutShape,
    type NodeShape,
    drawnHostOf,
    drawnPoolOf,
    frameIdsOf,
    framesAroundOf,
    holdingPoolOf,
    innermostFrameOf,
    innermostLaneOf,
    isFrame,
    lanesOf,
    liesOnAnotherPool,
    otherEndOf,
    sharedFrameOf,
} from "./layoutModel";

const PLANE = "Collaboration_1";

function node(id: string, relations: Partial<NodeShape> = {}): NodeShape {
    return {
        kind: "node",
        id,
        ...rootPlane(PLANE),
        bounds: { x: 0, y: 0, width: 100, height: 80 },
        outline: "rectangle",
        expanded: false,
        subProcesses: [],
        lanes: [],
        mayLieOutsidePool: false,
        ...relations,
    };
}

function pool(id: string, bounds: DiagramBounds = { x: 0, y: 0, width: 900, height: 300 }) {
    return {
        kind: "pool",
        id,
        ...rootPlane(PLANE),
        bounds,
        outline: "rectangle",
    } as const;
}

function layoutOf(shapes: readonly LayoutShape[]): LayoutModel {
    return { shapes: new Map(shapes.map((shape) => [shape.id, shape])), edges: new Map() };
}

const flow: LayoutEdge = {
    id: "Flow_1",
    plane: PLANE,
    source: "A",
    target: "B",
    waypoints: [],
    kind: "sequenceFlow",
};

describe("otherEndOf", () => {
    it("names a flow's other end", () => {
        expect(otherEndOf("source")).toBe("target");
        expect(otherEndOf("target")).toBe("source");
    });
});

describe("sharedFrameOf", () => {
    it("is the innermost expanded sub-process both ends lie in", () => {
        const layout = layoutOf([
            pool("Pool_1"),
            node("Sub_Outer", { expanded: true, pool: "Pool_1" }),
            node("Sub_Inner", { expanded: true, pool: "Pool_1", subProcesses: ["Sub_Outer"] }),
            node("A", { pool: "Pool_1", subProcesses: ["Sub_Inner", "Sub_Outer"] }),
            node("B", { pool: "Pool_1", subProcesses: ["Sub_Outer"] }),
        ]);

        expect(sharedFrameOf(layout, flow)?.id).toBe("Sub_Outer");
    });

    it("is the pool when the ends share no sub-process drawn open on the flow's plane", () => {
        const layout = layoutOf([
            pool("Pool_1"),
            node("Sub_1", { pool: "Pool_1" }),
            node("A", { pool: "Pool_1", subProcesses: ["Sub_1"] }),
            node("B", { pool: "Pool_1", subProcesses: ["Sub_1"] }),
        ]);

        expect(sharedFrameOf(layout, flow)?.id).toBe("Pool_1");
    });

    it("is none for a flow between two pools, or to a pool", () => {
        const twoPools = layoutOf([
            pool("Pool_1"),
            pool("Pool_2"),
            node("A", { pool: "Pool_1" }),
            node("B", { pool: "Pool_2" }),
        ]);
        const toPool = layoutOf([pool("Pool_1"), pool("B"), node("A", { pool: "Pool_1" })]);

        expect(sharedFrameOf(twoPools, flow)).toBeUndefined();
        expect(sharedFrameOf(toPool, flow)).toBeUndefined();
    });

    it("leaves out the pool of a data store, which may lie outside it", () => {
        const layout = layoutOf([
            pool("Pool_1"),
            node("A", { pool: "Pool_1" }),
            node("B", { pool: "Pool_1", mayLieOutsidePool: true }),
        ]);

        expect(sharedFrameOf(layout, flow)).toBeUndefined();
    });
});

describe("framesAroundOf", () => {
    it("lists every frame drawn around the node: its open sub-processes, pool and lanes", () => {
        const lane = {
            kind: "lane",
            id: "Lane_1",
            ...rootPlane(PLANE),
            parent: "Process_1",
            outline: "rectangle",
            bounds: { x: 30, y: 0, width: 870, height: 300 },
        } as const;
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

describe("innermostFrameOf and innermostLaneOf", () => {
    const lane = (id: string, parent: string, height: number): LayoutShape => ({
        kind: "lane",
        id,
        ...rootPlane(PLANE),
        bounds: { x: 30, y: 0, width: 870, height },
        outline: "rectangle",
        parent,
        pool: "Pool_1",
    });

    it("finds the lane no other lane of the node is nested in, even of the same height as its parent", () => {
        const layout = layoutOf([
            pool("Pool_1"),
            lane("Lane_Parent", "Process_1", 300),
            lane("Lane_Child", "Lane_Parent", 300),
            node("A", { pool: "Pool_1", lanes: ["Lane_Parent", "Lane_Child"] }),
        ]);
        const inLanes = layout.shapes.get("A") as NodeShape;

        expect(innermostLaneOf(layout, inLanes)?.id).toBe("Lane_Child");
        expect(innermostFrameOf(layout, inLanes)?.id).toBe("Pool_1");
    });

    it("finds the open sub-process around the node and no lane", () => {
        const layout = layoutOf([
            pool("Pool_1"),
            lane("Lane_1", "Process_1", 300),
            node("Sub_1", { expanded: true, pool: "Pool_1", lanes: ["Lane_1"] }),
            node("A", { pool: "Pool_1", lanes: ["Lane_1"], subProcesses: ["Sub_1"] }),
        ]);
        const inSub = layout.shapes.get("A") as NodeShape;

        expect(innermostFrameOf(layout, inSub)?.id).toBe("Sub_1");
        expect(innermostLaneOf(layout, inSub)).toBeUndefined();
    });
});

describe("drawnHostOf", () => {
    it.each([
        ["the host drawn on the event's plane", [node("Task_H")], "Task_H"],
        [
            "no host drawn on another plane",
            [node("Task_H", { ...subProcessPlane("Sub_1") })],
            undefined,
        ],
        ["no host it does not draw", [], undefined],
    ])("is %s", (_, shapes, host) => {
        const timer = node("Timer_1", { host: "Task_H" });

        expect(drawnHostOf(layoutOf([...shapes, timer]), timer)?.id).toBe(host);
    });

    it("is none for a node attached to nothing", () => {
        const task = node("Task_A");

        expect(drawnHostOf(layoutOf([node("Task_H"), task]), task)).toBeUndefined();
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

describe("isFrame", () => {
    const lane = {
        kind: "lane",
        id: "Lane_1",
        ...rootPlane(PLANE),
        parent: "Process_1",
        outline: "rectangle",
        bounds: { x: 30, y: 0, width: 870, height: 300 },
    } as const;

    it.each<[string, LayoutShape, boolean]>([
        ["a pool", pool("Pool_1"), true],
        ["a lane", lane, true],
        ["a sub-process drawn open", node("Sub_1", { expanded: true }), true],
        ["a collapsed sub-process or task", node("Task_A"), false],
    ])("tells whether %s holds other shapes", (_, shape, frame) => {
        expect(isFrame(shape)).toBe(frame);
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

describe("lanesOf", () => {
    const lane = (
        id: string,
        bounds: DiagramBounds,
        plane = PLANE,
        inPool: string | undefined = "Pool_1",
    ): LayoutShape => ({
        kind: "lane",
        id,
        ...rootPlane(plane),
        bounds,
        outline: "rectangle",
        parent: "Process_1",
        ...(inPool === undefined ? {} : { pool: inPool }),
    });

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

describe("liesOnAnotherPool", () => {
    const own = pool("Pool_1", { x: 0, y: 0, width: 670, height: 200 });

    it.each([
        {
            label: "a pool it covers on its plane",
            other: pool("Pool_2", { x: 662, y: 0, width: 600, height: 200 }),
            lies: true,
        },
        {
            label: "a pool it only touches",
            other: pool("Pool_2", { x: 670, y: 0, width: 600, height: 200 }),
            lies: false,
        },
        {
            label: "a pool on another plane",
            other: { ...pool("Pool_2", { x: 662, y: 0, width: 600, height: 200 }), plane: "Sub_1" },
            lies: false,
        },
    ])("is $lies for $label", ({ other, lies }) => {
        expect(liesOnAnotherPool(layoutOf([own, other]), own)).toBe(lies);
    });
});
