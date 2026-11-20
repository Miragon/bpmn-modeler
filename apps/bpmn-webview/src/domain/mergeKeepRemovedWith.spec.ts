import { describe, expect, it } from "vitest";

import type { MergePaneRestoreOffer } from "@miragon/bpmn-modeler-shared";

import { keepRemovedWith } from "./mergeKeepRemovedWith";

describe("keepRemovedWith", () => {
    const OFFER: MergePaneRestoreOffer = {
        elementId: "Task_1",
        connections: ["Flow_1"],
        removedBy: "current",
    };

    it.each([
        [
            "the offered element",
            "Task_1",
            { kind: "keepRemovedWith", side: "incoming", offer: OFFER },
        ],
        ["another element", "Task_2", undefined],
    ])("keeps what was removed with %s from the side that kept it", (_case, id, expected) => {
        expect(keepRemovedWith({ restoreOffer: OFFER }, id)).toStrictEqual(expected);
    });

    it("offers nothing without an offer", () => {
        expect(keepRemovedWith({}, "Task_1")).toBeUndefined();
    });
});
