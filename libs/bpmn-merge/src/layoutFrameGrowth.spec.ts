import { describe, expect, it } from "vitest";

import { box, lane, node, pool as buildPool } from "./__fixtures__/layoutShapes";
import type { Axis } from "./layoutAxis";
import { type GrowingFrame, growingFrameOf } from "./layoutFrameGrowth";
import type { FrameScope } from "./layoutFrames";

describe("growingFrameOf", () => {
    const pool = buildPool("Pool_1", box(0, 0, 1200, 300));
    const laneInPool = lane("Lane_1", box(30, 0, 1170, 300), { pool: "Pool_1" });
    const planeLane = lane("Lane_1", box(30, 0, 1170, 300));
    const subProcess = node("Sub_1", {
        bounds: box(100, 50, 300, 200),
        lanes: ["Lane_1"],
        expanded: true,
    });

    it.each<[string, FrameScope, Axis, GrowingFrame]>([
        [
            "a sub-process along x",
            { container: subProcess, lane: undefined },
            "x",
            { kind: "subProcess", subProcess },
        ],
        [
            "a sub-process along y",
            { container: subProcess, lane: undefined },
            "y",
            { kind: "subProcess", subProcess },
        ],
        [
            "a lane of a pool down",
            { container: pool, lane: laneInPool },
            "y",
            { kind: "laneDown", lane: laneInPool, pool, keepsPoolsLevel: true },
        ],
        [
            "a lane on a plane without a pool down",
            { container: undefined, lane: planeLane },
            "y",
            { kind: "laneDown", lane: planeLane, pool: undefined, keepsPoolsLevel: false },
        ],
        [
            "the pool, not the lane, along x",
            { container: pool, lane: laneInPool },
            "x",
            { kind: "pool", pool, keepsPoolsLevel: false },
        ],
        [
            "a pool without lanes down, which the pools level with it follow",
            { container: pool, lane: undefined },
            "y",
            { kind: "pool", pool, keepsPoolsLevel: true },
        ],
        [
            "the lanes of a plane without a pool along x",
            { container: undefined, lane: planeLane },
            "x",
            { kind: "planeLanes", lane: planeLane },
        ],
        [
            "nothing on a plane outside lanes",
            { container: undefined, lane: undefined },
            "y",
            { kind: "plane" },
        ],
    ])("grows %s", (_, scope, axis, frame) => {
        expect(growingFrameOf(scope, axis)).toEqual(frame);
    });
});
