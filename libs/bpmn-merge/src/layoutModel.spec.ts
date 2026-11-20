import { describe, expect, it } from "vitest";

import { PLANE, flow, layoutOf, node, pool } from "./__fixtures__/layoutShapes";
import { rootPlane, subProcessPlane } from "./__fixtures__/shapePlane";
import {
    type LayoutEdge,
    type LayoutShape,
    drawnHostOf,
    isFrame,
    liesOnAnotherPool,
    otherEndOf,
    sharesAnEndWith,
} from "./layoutModel";

describe("otherEndOf", () => {
    it("names a flow's other end", () => {
        expect(otherEndOf("source")).toBe("target");
        expect(otherEndOf("target")).toBe("source");
    });
});

describe("sharesAnEndWith", () => {
    it.each<[string, Partial<LayoutEdge>, boolean]>([
        ["its source", { id: "Flow_2", target: "C" }, true],
        ["its target", { id: "Flow_2", source: "C" }, true],
        ["neither end", { id: "Flow_2", source: "B", target: "A" }, false],
    ])("tells a flow that shares %s with another", (_, other, shares) => {
        expect(sharesAnEndWith(flow, { ...flow, ...other })).toBe(shares);
    });

    it("does not tell two flows drawn without ends as sharing one", () => {
        const loose = { ...flow, source: undefined, target: undefined };

        expect(sharesAnEndWith(loose, { ...loose, id: "Flow_2" })).toBe(false);
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
