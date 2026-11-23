import { describe, expect, it } from "vitest";

import type { MergePaneShapelessRow } from "@miragon/bpmn-modeler-shared";

import {
    elementPickOf,
    type MergeElementPick,
    type MergeElementPickStates,
    mergesPickedXml,
    mergeXmlStartOf,
    panePicks,
    ownPickOf,
} from "./mergeElementPick";

const MESSAGE_ROW: MergePaneShapelessRow = {
    id: "Message_1",
    type: "bpmn:Message",
    marker: "takenFromOtherSide",
    pick: { keptSide: "incoming", scope: "element" },
    handMerge: "pickedVersion",
    differences: [],
};

const STATES = {
    pickable: [
        {
            id: "Task_Remind",
            pick: { keptSide: "current", scope: "withContents", mergedByHand: true },
            handMerge: "pickedVersion",
        },
        { id: "Task_Open", takenSide: "current" },
        { id: "Task_Conflict", handMerge: "withPick" },
        { id: "Task_Cancel", pick: { keptSide: "incoming", scope: "element" } },
        {
            id: "Message_1",
            pick: { keptSide: "incoming", scope: "element" },
            handMerge: "pickedVersion",
        },
    ],
} as const satisfies MergeElementPickStates;

describe("elementPickOf", () => {
    it.each<[string, string, MergeElementPick]>([
        [
            "picked, and its XML can be merged by hand",
            "Task_Remind",
            {
                pick: { keptSide: "current", scope: "withContents", mergedByHand: true },
                handMerge: "pickedVersion",
            },
        ],
        ["picked alone", "Task_Cancel", { pick: { keptSide: "incoming", scope: "element" } }],
        ["open", "Task_Open", {}],
        [
            "open, and its XML can be merged by hand with a pick",
            "Task_Conflict",
            { handMerge: "withPick" },
        ],
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

describe("mergeXmlStartOf", () => {
    it.each([
        [{ handMerge: "pickedVersion" } as const, true, "pickedVersion"],
        [{ handMerge: "withPick" } as const, true, "withPick"],
        [{ handMerge: "pickedVersion" } as const, false, undefined],
        [{ handMerge: "withPick" } as const, false, undefined],
        [{}, true, undefined],
        [{}, false, undefined],
    ])("an element %o, the host offering a merge editor: %s → %s", (element, offered, expected) => {
        expect(mergeXmlStartOf(element, { elementXmlMerge: offered })).toBe(expected);
    });
});

describe("mergesPickedXml", () => {
    it.each([
        [{ handMerge: "pickedVersion" } as const, true, true],
        [{ handMerge: "pickedVersion" } as const, false, false],
        [{ handMerge: "withPick" } as const, true, false],
        [{}, true, false],
    ])("an element %o, the host offering a merge editor: %s → %s", (element, offered, expected) => {
        expect(mergesPickedXml(element, { elementXmlMerge: offered })).toBe(expected);
    });
});
