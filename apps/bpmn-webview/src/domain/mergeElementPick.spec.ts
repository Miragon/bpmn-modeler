import { describe, expect, it } from "vitest";

import type { MergePaneRestoreOffer, MergePaneShapelessRow } from "@miragon/bpmn-modeler-shared";

import {
    elementPickOf,
    keepRemovedWith,
    type MergeElementPick,
    offersMergeXml,
    rowPickOf,
} from "./mergeElementPick";

const MESSAGE_ROW: MergePaneShapelessRow = {
    id: "Message_1",
    type: "bpmn:Message",
    marker: "takenFromOtherSide",
    pick: { keptSide: "incoming", scope: "element" },
    handMergeable: true,
    differences: [],
};

const STATES = {
    pickable: [
        { id: "Task_Remind", undo: "element", handMergeable: true },
        { id: "Task_Cancel", undo: "element" },
        { id: "Message_1", undo: "element", handMergeable: true },
    ],
    badges: [
        {
            id: "Task_Remind",
            kind: "keptHere",
            keptSide: "current",
            scope: "withContents",
            mergedByHand: true,
        },
    ],
    picksNotDrawn: [
        { id: "Task_Cancel", keptSide: "incoming", scope: "element" },
        { id: "Message_1", keptSide: "incoming", scope: "element" },
    ],
    shapelessRows: [MESSAGE_ROW, { ...MESSAGE_ROW, id: "Message_Unlisted" }],
} as const;

describe("elementPickOf", () => {
    it.each<[string, string, MergeElementPick]>([
        [
            "drawn with a badge",
            "Task_Remind",
            {
                pick: { keptSide: "current", scope: "withContents", mergedByHand: true },
                handMergeable: true,
            },
        ],
        [
            "picked but drawn by the partner alone",
            "Task_Cancel",
            { pick: { keptSide: "incoming", scope: "element" } },
        ],
        [
            "a menu row the pane also lists as picked",
            "Message_1",
            { pick: { keptSide: "incoming", scope: "element" }, handMergeable: true },
        ],
        [
            "a menu row alone",
            "Message_Unlisted",
            { pick: { keptSide: "incoming", scope: "element" }, handMergeable: true },
        ],
        ["neither picked nor listed", "Task_Gone", {}],
    ])("reads the pick of an element %s: %s", (_case, id, expected) => {
        expect(elementPickOf(STATES, id)).toStrictEqual(expected);
    });

    it("reads a menu row's own pick, as the pane finds it", () => {
        expect(rowPickOf(MESSAGE_ROW)).toStrictEqual(elementPickOf(STATES, "Message_1"));
    });

    it("reads nothing of a row that is not there", () => {
        expect(rowPickOf(undefined)).toStrictEqual({});
    });
});

describe("offersMergeXml", () => {
    it.each([
        [{ handMergeable: true } as const, true, true],
        [{ handMergeable: true } as const, false, false],
        [{}, true, false],
        [{}, false, false],
    ])("an element %o, the host offering a merge editor: %s → %s", (element, offered, expected) => {
        expect(offersMergeXml(element, { elementXmlMerge: offered })).toBe(expected);
    });
});

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
