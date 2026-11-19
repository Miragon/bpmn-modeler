import { describe, expect, it } from "vitest";

import type { FlowRelation } from "./layoutFlowTopology";
import { type RoomSlots, slotsFor } from "./layoutMakeRoom";

describe("slotsFor", () => {
    it.each<[FlowRelation, boolean, RoomSlots]>([
        ["parallel", true, { stacked: true, inLine: ["after"] }],
        ["precedes", true, { stacked: false, inLine: ["before", "after"] }],
        ["follows", true, { stacked: false, inLine: ["after"] }],
        ["unrelated", true, { stacked: false, inLine: ["after"] }],
        ["parallel", false, { stacked: false, inLine: ["after"] }],
        ["precedes", false, { stacked: false, inLine: ["after"] }],
        ["follows", false, { stacked: false, inLine: ["after"] }],
        ["unrelated", false, { stacked: false, inLine: ["after"] }],
    ])(
        "draws a shape that %s the other, with flows running right %s, as %j",
        (relation, flowsRight, slots) => {
            expect(slotsFor(relation, flowsRight)).toEqual(slots);
        },
    );
});
