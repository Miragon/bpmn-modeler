import { describe, expect, it } from "vitest";

import type { MergePaneShapelessRow } from "@miragon/bpmn-modeler-shared";

import {
    elementPickOf,
    type MergeElementPick,
    type MergeElementPickStates,
    offersMergeXml,
    panePicks,
    ownPickOf,
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
        {
            id: "Task_Remind",
            pick: { keptSide: "current", scope: "withContents", mergedByHand: true },
            handMergeable: true,
        },
        { id: "Task_Open", takenSide: "current" },
        { id: "Task_Cancel", pick: { keptSide: "incoming", scope: "element" } },
        { id: "Message_1", pick: { keptSide: "incoming", scope: "element" }, handMergeable: true },
    ],
} as const satisfies MergeElementPickStates;

describe("elementPickOf", () => {
    it.each<[string, string, MergeElementPick]>([
        [
            "picked, and its XML can be merged by hand",
            "Task_Remind",
            {
                pick: { keptSide: "current", scope: "withContents", mergedByHand: true },
                handMergeable: true,
            },
        ],
        ["picked alone", "Task_Cancel", { pick: { keptSide: "incoming", scope: "element" } }],
        ["open", "Task_Open", {}],
        ["not pickable on the pane", "Task_Gone", {}],
    ])("reads the pick of an element %s: %s", (_case, id, expected) => {
        expect(elementPickOf(STATES, id)).toStrictEqual(expected);
    });

    it("reads a menu row's own pick, as the pane finds it", () => {
        expect(ownPickOf(MESSAGE_ROW)).toStrictEqual(elementPickOf(STATES, "Message_1"));
    });

    it("reads nothing of a row that is not there", () => {
        expect(ownPickOf(undefined)).toStrictEqual({});
    });
});

describe("panePicks", () => {
    it("lists each picked element once with its pick, in the order the host sends them", () => {
        expect(panePicks(STATES)).toStrictEqual([
            {
                id: "Task_Remind",
                pick: { keptSide: "current", scope: "withContents", mergedByHand: true },
            },
            { id: "Task_Cancel", pick: { keptSide: "incoming", scope: "element" } },
            { id: "Message_1", pick: { keptSide: "incoming", scope: "element" } },
        ]);
    });

    it("reads the pick elementPickOf reads for every element", () => {
        for (const { id, pick } of panePicks(STATES)) {
            expect(elementPickOf(STATES, id).pick).toStrictEqual(pick);
        }
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
