import { describe, expect, it } from "vitest";

import type { DiagramBounds } from "./layoutGeometry";
import {
    type LayoutEdge,
    type LayoutModel,
    type LayoutShape,
    type NodeShape,
    drawnHostOf,
    drawnPoolOf,
    drawingOfSameSize,
    drawsAt,
    drawsWhereItLies,
    frameIdsOf,
    framesAroundOf,
    isFrame,
    lanesOf,
    liesOnAnotherPool,
    otherEndOf,
    placeOf,
    placedByBuild,
    sharedFrameOf,
} from "./layoutModel";

const PLANE = "Collaboration_1";

function node(id: string, relations: Partial<NodeShape> = {}): NodeShape {
    return {
        kind: "node",
        id,
        plane: PLANE,
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
    return { kind: "pool", id, plane: PLANE, bounds, outline: "rectangle" } as const;
}

function layoutOf(shapes: readonly LayoutShape[]): LayoutModel {
    return { shapes: new Map(shapes.map((shape) => [shape.id, shape])), edges: new Map() };
}

const flow: LayoutEdge = { id: "Flow_1", plane: PLANE, source: "A", target: "B", waypoints: [] };

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
            plane: PLANE,
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

describe("drawnHostOf", () => {
    it.each([
        ["the host drawn on the event's plane", [node("Task_H")], "Task_H"],
        ["no host drawn on another plane", [node("Task_H", { plane: "Sub_1" })], undefined],
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

describe("isFrame", () => {
    const lane = {
        kind: "lane",
        id: "Lane_1",
        plane: PLANE,
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

describe("placeOf and drawsAt", () => {
    const task = node("Task_1", { bounds: { x: 100, y: 100, width: 100, height: 80 } });

    it.each([
        { label: "where the node lies", drawn: task, place: task.bounds, at: true },
        {
            label: "elsewhere at the node's size",
            drawn: { ...task, bounds: { ...task.bounds, x: 300 } },
            place: { ...task.bounds, x: 300 },
            at: false,
        },
        {
            label: "at another size",
            drawn: { ...task, bounds: { ...task.bounds, width: 200 } },
            place: undefined,
            at: false,
        },
        {
            label: "on another plane",
            drawn: { ...task, plane: "Sub_1" },
            place: undefined,
            at: false,
        },
    ])("a layout drawing the node $label", ({ drawn, place, at }) => {
        const layout = layoutOf([drawn]);

        expect(placeOf(layout, task)).toEqual(place);
        expect(drawsAt(layout, task)).toBe(at);
    });

    it("has no place for a node it does not draw", () => {
        expect(placeOf(layoutOf([]), task)).toBeUndefined();
        expect(drawsAt(layoutOf([]), task)).toBe(false);
    });
});

describe("drawingOfSameSize and drawsWhereItLies", () => {
    const task = node("Task_1", { bounds: { x: 100, y: 100, width: 100, height: 80 } });

    it.each([
        { label: "where the node lies", drawn: task, found: true, there: true },
        {
            label: "where the node lies on another plane",
            drawn: { ...task, plane: "Sub_1" },
            found: true,
            there: true,
        },
        {
            label: "elsewhere at the node's size",
            drawn: { ...task, bounds: { ...task.bounds, x: 300 } },
            found: true,
            there: false,
        },
        {
            label: "at another size",
            drawn: { ...task, bounds: { ...task.bounds, width: 200 } },
            found: false,
            there: false,
        },
    ])("a layout drawing the node $label", ({ drawn, found, there }) => {
        const layout = layoutOf([drawn]);

        expect(drawingOfSameSize(layout, task)).toBe(found ? drawn : undefined);
        expect(drawsWhereItLies(layout, task)).toBe(there);
    });

    it("finds no drawing of a node the layout does not draw", () => {
        expect(drawingOfSameSize(layoutOf([]), task)).toBeUndefined();
        expect(drawsWhereItLies(layoutOf([]), task)).toBe(false);
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
    const lane = (id: string, bounds: DiagramBounds, plane = PLANE): LayoutShape => ({
        kind: "lane",
        id,
        plane,
        bounds,
        outline: "rectangle",
        parent: "Process_1",
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
            lane("Lane_Other", { x: 30, y: 400, width: 870, height: 200 }),
            lane("Lane_Elsewhere", { x: 30, y: 0, width: 870, height: 150 }, "Sub_1"),
        ]);

        expect(lanesOf(layout, layout.shapes.get("Pool_1")!)).toEqual(own);
    });
});

describe("placedByBuild", () => {
    const task = node("Task_1", { bounds: { x: 100, y: 100, width: 100, height: 80 } });
    const elsewhere = { ...task, bounds: { ...task.bounds, x: 300 } };

    it.each([
        { label: "both sides draw it where it lies", sides: [[task], [task]], placed: false },
        { label: "one side draws it elsewhere", sides: [[task], [elsewhere]], placed: true },
        { label: "one side lacks it", sides: [[task], []], placed: true },
        {
            label: "one side draws it on another plane",
            sides: [[task], [{ ...task, plane: "Sub_1" }]],
            placed: true,
        },
    ])("is $placed when $label", ({ sides, placed }) => {
        expect(placedByBuild(task, sides.map(layoutOf))).toBe(placed);
    });

    it("is false for a boundary event, which goes with its host", () => {
        const timer = node("Timer_1", { host: "Task_1" });

        expect(placedByBuild(timer, [layoutOf([]), layoutOf([])])).toBe(false);
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
