import { describe, expect, it } from "vitest";

import type { MergeSide } from "@miragon/bpmn-modeler-types";

import { reopenedConflicts, restoreOfferOnPane } from "./pickFeedback";

describe("reopenedConflicts", () => {
    it.each<[string, readonly string[], readonly string[], readonly string[]]>([
        ["none when a pick only closes conflicts", ["A", "B"], ["B"], []],
        ["an element open after the pick that was decided before", ["A"], ["C", "B"], ["C", "B"]],
        ["each in the order open after the pick", ["B"], ["C", "B", "A"], ["C", "A"]],
        ["none when nothing was open", [], [], []],
    ])("names %s", (_name, openBefore, openAfter, reopened) => {
        expect(reopenedConflicts(openBefore, openAfter)).toStrictEqual(reopened);
    });
});

describe("restoreOfferOnPane", () => {
    const offer = {
        elementId: "Task_Reject",
        connections: ["Flow_No"],
        keptSide: "incoming",
    } as const;

    it.each<[MergeSide, ReturnType<typeof restoreOfferOnPane>]>([
        ["incoming", { elementId: "Task_Reject", connections: ["Flow_No"], removedBy: "current" }],
        ["current", undefined],
    ])("offers the flows on the pane that kept the element only: %s", (paneSide, expected) => {
        expect(restoreOfferOnPane(offer, paneSide)).toStrictEqual(expected);
    });

    it("offers nothing without flows left out", () => {
        expect(restoreOfferOnPane({ ...offer, connections: [] }, "incoming")).toBeUndefined();
        expect(restoreOfferOnPane(undefined, "incoming")).toBeUndefined();
    });
});
