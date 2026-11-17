import { describe, expect, it } from "vitest";

import { FLOW_BADGE_RADIUS, flowBadgePlace } from "./mergeFlowBadgePlace";

describe("flowBadgePlace", () => {
    it.each<[string, { x: number; y: number }[], { left: number; top: number } | undefined]>([
        [
            "puts the check in the middle of a straight flow, from its box's top left",
            [
                { x: 100, y: 200 },
                { x: 300, y: 200 },
            ],
            { left: 100, top: 0 },
        ],
        [
            "picks the longest segment of a bent flow",
            [
                { x: 100, y: 100 },
                { x: 100, y: 130 },
                { x: 260, y: 130 },
                { x: 260, y: 150 },
            ],
            { left: 80, top: 30 },
        ],
        [
            "keeps it clear of the arrowhead on a flow whose last segment is the longest",
            [
                { x: 0, y: 0 },
                { x: 0, y: 20 },
                { x: 60, y: 20 },
            ],
            { left: 30, top: 20 },
        ],
        [
            "leaves it out on a flow whose longest segment is short",
            [
                { x: 0, y: 0 },
                { x: 30, y: 0 },
                { x: 30, y: 30 },
            ],
            undefined,
        ],
        ["leaves it out on a flow without two waypoints", [{ x: 0, y: 0 }], undefined],
    ])("%s", (_case, waypoints, expected) => {
        expect(flowBadgePlace(waypoints)).toStrictEqual(expected);
    });

    it("leaves the check's whole circle off the arrowhead at the last waypoint", () => {
        const waypoints = [
            { x: 0, y: 0 },
            { x: 48, y: 0 },
        ];
        const place = flowBadgePlace(waypoints);
        const arrowheadLength = 11;

        expect(place).toBeDefined();
        expect(48 - (place?.left ?? 48) - FLOW_BADGE_RADIUS).toBeGreaterThan(arrowheadLength);
    });
});
