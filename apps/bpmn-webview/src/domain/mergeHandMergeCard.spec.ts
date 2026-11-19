import { describe, expect, it } from "vitest";

import type { MergePaneShapelessRow } from "@miragon/bpmn-modeler-shared";

import { elementPickOf, rowPickOf } from "./mergeElementPick";
import { handMergeFactsOf, type MergeHandMergeFacts } from "./mergeHandMergeCard";
import { mergePadDecisions } from "./mergePadDecisions";

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
                handMergeFactsOf(elementPickOf(STATES, id), { elementXmlMerge: offered }),
            ).toStrictEqual(expected);
        },
    );

    it("reads a menu row's own pick, as the pane finds it", () => {
        const offers = { elementXmlMerge: true };

        expect(handMergeFactsOf(rowPickOf(MESSAGE_ROW), offers)).toStrictEqual(
            handMergeFactsOf(elementPickOf(STATES, "Message_1"), offers),
        );
    });
});

describe("the pad and the card read one pick", () => {
    const PANE = {
        ...STATES,
        caption: { side: "current", role: "branch" },
        pickable: [
            ...STATES.pickable,
            { id: "Task_Open", handMergeable: true },
            { id: "Task_Kept", undo: "element", handMergeable: true },
        ],
        badges: [
            ...STATES.badges,
            { id: "Task_Kept", kind: "replacedHere", keptSide: "incoming", scope: "element" },
        ],
    } as const;

    it.each([
        ["Task_Remind", true],
        ["Task_Remind", false],
        ["Task_Open", true],
        ["Task_Kept", true],
        ["Task_Kept", false],
    ])(
        "the pad's Merge XML on drawn %s and the card's Edit again agree, the host offering it: %s",
        (id, offered) => {
            const offers = { elementXmlMerge: offered };
            const card = handMergeFactsOf(elementPickOf(PANE, id), offers);
            const mergeXml = mergePadDecisions(PANE, id, offers).find(
                (decision) => decision.kind === "mergeXml",
            );

            expect(mergeXml === undefined ? undefined : mergeXml.mode).toBe(
                card.canEditAgain ? (card.mergedByHand ? "edit" : "open") : undefined,
            );
        },
    );
});
