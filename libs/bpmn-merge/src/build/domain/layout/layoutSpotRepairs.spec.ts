import { describe, expect, it } from "vitest";

import { SpotRepairs, flowSpotRepairs } from "./layoutSpotRepairs";
import type { LayoutSpot } from "./layoutSpots";

const overlap = { kind: "shapesOverlap", shapes: ["Task_A", "Task_B"] } as const;
const outside = { kind: "shapeOutsideContainer", shape: "Task_A", container: "Lane_1" } as const;
const endOff = {
    kind: "flowEndOffShape",
    flow: "Flow_1",
    end: "Task_B",
    at: "target",
    lies: "outside",
} as const;

describe("SpotRepairs", () => {
    it("looks a spot up by the spot its step acted on, whichever order it names a pair in", () => {
        const repairs = new SpotRepairs([
            { spot: outside, repair: { kind: "grewContainer" } },
            { spot: overlap, repair: { kind: "movedByBuild", moved: "Task_B" } },
        ]);

        expect(repairs.of({ kind: "shapesOverlap", shapes: ["Task_B", "Task_A"] })).toEqual({
            kind: "movedByBuild",
            moved: "Task_B",
        });
        expect(repairs.of(outside)).toEqual({ kind: "grewContainer" });
    });

    it("says no step repaired a spot none acted on", () => {
        const repairs = new SpotRepairs([{ spot: outside, repair: { kind: "grewContainer" } }]);

        expect(repairs.of({ ...outside, container: "Lane_2" })).toEqual({ kind: "notRepaired" });
        expect(repairs.of(endOff)).toEqual({ kind: "notRepaired" });
    });

    it("takes the last step's repair of a spot two steps acted on", () => {
        const repairs = new SpotRepairs([
            { spot: overlap, repair: { kind: "movedByBuild", moved: "Task_A" } },
            { spot: overlap, repair: { kind: "notRepaired" } },
        ]);

        expect(repairs.of(overlap)).toEqual({ kind: "notRepaired" });
    });

    it("answers every spot of a flow with the flow's re-route", () => {
        const repairs = new SpotRepairs([{ spot: endOff, repair: { kind: "movedByBuild" } }]);

        expect(repairs.of({ kind: "flowThroughShape", flow: "Flow_1", shape: "Task_C" })).toEqual({
            kind: "movedByBuild",
        });
    });

    it("says a spot is repaired only when a step mended it", () => {
        const repairs = new SpotRepairs([
            { spot: outside, repair: { kind: "notRepaired" } },
            { spot: overlap, repair: { kind: "movedByBuild", moved: "Task_A" } },
        ]);
        const offHost: LayoutSpot = { kind: "boundaryEventOffHost", boundaryEvent: "B", host: "H" };

        expect([overlap, outside, offHost].map((spot) => repairs.repaired(spot))).toEqual([
            true,
            false,
            false,
        ]);
    });
});

describe("flowSpotRepairs", () => {
    it("keys each flow's repair by the first spot of the flow, which answers for its other spots", () => {
        const through = { kind: "flowThroughShape", flow: "Flow_1", shape: "Task_C" } as const;
        const stuck = { kind: "flowThroughShape", flow: "Flow_2", shape: "Task_C" } as const;

        expect(
            flowSpotRepairs(
                [endOff, overlap, through, stuck],
                [
                    { kind: "movedByBuild", flow: "Flow_1", waypoints: [{ x: 0, y: 0 }] },
                    { kind: "notRepaired", flow: "Flow_2" },
                ],
            ),
        ).toEqual([
            { spot: endOff, repair: { kind: "movedByBuild" } },
            { spot: stuck, repair: { kind: "notRepaired" } },
        ]);
    });

    it("leaves a flow out that no repair planned", () => {
        expect(flowSpotRepairs([endOff], [])).toEqual([]);
    });
});
