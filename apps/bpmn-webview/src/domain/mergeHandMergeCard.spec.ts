import { describe, expect, it } from "vitest";

import type { MergePaneShapelessRow } from "@miragon/bpmn-modeler-shared";

import {
    handMergeElementOf,
    handMergeFactsOf,
    type MergeHandMergeFacts,
} from "./mergeHandMergeCard";

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
    ],
    badges: [
        {
            id: "Task_Remind",
            kind: "keptHere",
            keptSide: "current",
            scope: "element",
            mergedByHand: true,
        },
    ],
    picksNotDrawn: [{ id: "Task_Cancel", keptSide: "incoming", scope: "element" }],
    shapelessRows: [MESSAGE_ROW],
} as const;

describe("handMergeFactsOf", () => {
    it.each<[string, boolean, MergeHandMergeFacts]>([
        ["Task_Remind", true, { keptSide: "current", mergedByHand: true, canEditAgain: true }],
        ["Task_Remind", false, { keptSide: "current", mergedByHand: true, canEditAgain: false }],
        ["Task_Cancel", true, { keptSide: "incoming", mergedByHand: false, canEditAgain: false }],
        ["Message_1", true, { keptSide: "incoming", mergedByHand: false, canEditAgain: true }],
        ["Task_Gone", true, { mergedByHand: false, canEditAgain: false }],
    ])(
        "reads %s's pick on a pane and whether it can be merged again, the host offering it: %s",
        (id, offered, expected) => {
            expect(
                handMergeFactsOf(handMergeElementOf(STATES, id), { elementXmlMerge: offered }),
            ).toStrictEqual(expected);
        },
    );

    it("reads a menu row's own pick, as the pane finds it", () => {
        const offers = { elementXmlMerge: true };

        expect(handMergeFactsOf(MESSAGE_ROW, offers)).toStrictEqual(
            handMergeFactsOf(handMergeElementOf(STATES, "Message_1"), offers),
        );
    });
});
