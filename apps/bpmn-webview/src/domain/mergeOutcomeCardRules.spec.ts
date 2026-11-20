import { describe, expect, it } from "vitest";

import type { MergePaneOutcome } from "@miragon/bpmn-modeler-shared";

import type { MergeActedDecision } from "./mergeActedDecision";
import {
    cardOnSelection,
    chooseOn,
    type MergeCardChange,
    type MergeSettle,
    outcomeToShowAt,
    rowOutcome,
    settleOn,
} from "./mergeOutcomeCardRules";
import {
    answerStates,
    EMPTY_OUTCOME_MEMORY,
    type MergeOutcomeAnswer,
    type MergeOutcomeMemory,
    type MergeOutcomeStates,
    rememberSent,
} from "./mergeOutcomeMemory";

const applied = (
    action: MergePaneOutcome["action"],
    elementId: string,
    lists: Partial<Record<"pulledIn" | "dropped" | "reopened", string[]>> = {},
): MergePaneOutcome => ({
    applied: true,
    action,
    elementId,
    pulledIn: [],
    dropped: [],
    reopened: [],
    ...lists,
});

const keepTask: MergeActedDecision = {
    kind: "keep",
    elementId: "Task_Remind",
    scope: "element",
    side: "incoming",
    origin: "canvas",
};
const undo = (elementId: string, origin: "canvas" | "menu" = "canvas"): MergeActedDecision => ({
    kind: "undo",
    elementId,
    scope: "element",
    origin,
});

const states = (overrides: Partial<MergeOutcomeStates> = {}): MergeOutcomeStates => ({
    pickable: [],
    allSteps: [
        { id: "Task_Remind", shapeless: false, onThisPane: true, onOtherPane: false },
        { id: "Message_1", shapeless: true, onThisPane: true, onOtherPane: true },
    ],
    ...overrides,
});

/** Sends `acted` and lets the host answer with `lastOutcome`. */
function sendAndAnswer(
    memory: MergeOutcomeMemory,
    acted: MergeActedDecision,
    lastOutcome: MergePaneOutcome,
    overrides: Partial<MergeOutcomeStates> = {},
) {
    return answerStates(rememberSent(memory, acted), states({ lastOutcome, ...overrides }));
}

describe("outcomeToShowAt", () => {
    const shown = sendAndAnswer(EMPTY_OUTCOME_MEMORY, keepTask, applied("pick", "Task_Remind"));

    it("shows the latest outcome again at its element", () => {
        expect(outcomeToShowAt(shown.memory, "Task_Remind")).toBe(shown.memory.latest);
    });

    it.each<[string, MergeOutcomeMemory, string | undefined]>([
        ["another element", shown.memory, "Task_Other"],
        ["no selection", shown.memory, undefined],
        ["a pane without an outcome", EMPTY_OUTCOME_MEMORY, "Task_Remind"],
        [
            "a decision made in the menu",
            sendAndAnswer(
                EMPTY_OUTCOME_MEMORY,
                undo("Task_Remind", "menu"),
                applied("unpick", "Task_Remind"),
            ).memory,
            "Task_Remind",
        ],
    ])("shows none at %s", (_case, memory, elementId) => {
        expect(outcomeToShowAt(memory, elementId)).toBeUndefined();
    });
});

describe("settleOn", () => {
    const onCanvas = sendAndAnswer(EMPTY_OUTCOME_MEMORY, keepTask, applied("pick", "Task_Remind"));
    const inRow = sendAndAnswer(
        EMPTY_OUTCOME_MEMORY,
        undo("Message_1", "menu"),
        applied("unpick", "Message_1"),
    );
    const partnerNewer = answerStates(
        inRow.memory,
        states({ lastOutcome: applied("pick", "Task_Remind") }),
    );

    it.each<[string, MergeOutcomeMemory, MergeOutcomeAnswer, MergeSettle]>([
        [
            "shows this pane's new outcome of a decision made on the canvas, announcing no row",
            onCanvas.memory,
            onCanvas.answer,
            { card: { kind: "show", outcome: onCanvas.memory.latest! } },
        ],
        [
            "closes the card and announces in its row the outcome of a decision made in the menu",
            inRow.memory,
            inRow.answer,
            { card: { kind: "close" }, rowOutcome: inRow.memory.latest! },
        ],
        [
            "closes the card for the partner's newer outcome, announcing no row",
            partnerNewer.memory,
            partnerNewer.answer,
            { card: { kind: "close" } },
        ],
        [
            "marks the card's blockers again while nothing is new",
            onCanvas.memory,
            "keep",
            { card: { kind: "remark" } },
        ],
        [
            "announces a row's outcome no second time while nothing is new",
            inRow.memory,
            "keep",
            { card: { kind: "remark" } },
        ],
    ])("%s", (_case, memory, answer, settled) => {
        expect(settleOn(memory, answer)).toStrictEqual(settled);
    });

    it("reads the answers the table settles", () => {
        expect([onCanvas.answer, inRow.answer, partnerNewer.answer]).toStrictEqual([
            "show",
            "show",
            "forget",
        ]);
    });
});

describe("cardOnSelection", () => {
    const { memory } = sendAndAnswer(
        EMPTY_OUTCOME_MEMORY,
        keepTask,
        applied("pick", "Task_Remind"),
    );

    it.each<[string, string | undefined, string | undefined, MergeCardChange]>([
        ["closes it on another element", "Task_Remind", "Task_Other", { kind: "close" }],
        ["closes it on no selection", "Task_Remind", undefined, { kind: "close" }],
        ["leaves it on its element", "Task_Remind", "Task_Remind", { kind: "keep" }],
        [
            "shows it again on its element",
            undefined,
            "Task_Remind",
            { kind: "show", outcome: memory.latest! },
        ],
        ["does nothing where no card shows or belongs", undefined, "Task_Other", { kind: "keep" }],
    ])("%s", (_case, shownAt, selected, change) => {
        expect(cardOnSelection(memory, shownAt, selected)).toStrictEqual(change);
    });
});

describe("rowOutcome", () => {
    it("says what a decision from a menu row did, on the pane that sent it", () => {
        const { memory } = sendAndAnswer(
            EMPTY_OUTCOME_MEMORY,
            undo("Message_1", "menu"),
            applied("unpick", "Message_1"),
        );

        expect(rowOutcome(memory)).toBe(memory.latest);
    });

    it.each<[string, MergeOutcomeMemory]>([
        ["a pane that sent nothing", EMPTY_OUTCOME_MEMORY],
        [
            "a decision made on the canvas",
            sendAndAnswer(EMPTY_OUTCOME_MEMORY, keepTask, applied("pick", "Task_Remind")).memory,
        ],
        [
            "a row decision the partner's newer one replaced",
            answerStates(
                sendAndAnswer(
                    EMPTY_OUTCOME_MEMORY,
                    undo("Message_1", "menu"),
                    applied("unpick", "Message_1"),
                ).memory,
                states({ lastOutcome: applied("pick", "Task_Remind") }),
            ).memory,
        ],
    ])("says nothing for %s", (_case, memory) => {
        expect(rowOutcome(memory)).toBeUndefined();
    });
});

describe("chooseOn", () => {
    const atStake: MergePaneOutcome = {
        applied: false,
        action: "pick",
        elementId: "Task_Remind",
        blockedBy: [],
        handMergesAtStake: ["Task_Remind"],
    };
    const asked = sendAndAnswer(EMPTY_OUTCOME_MEMORY, keepTask, atStake).memory;
    const refusedHandMerge = answerStates(
        answerStates(
            rememberSent(EMPTY_OUTCOME_MEMORY, {
                kind: "mergeXml",
                elementId: "Task_Remind",
                origin: "menu",
            }),
            states(),
        ).memory,
        states({
            lastOutcome: {
                applied: false,
                action: "mergeByHand",
                elementId: "Task_Remind",
                blockedBy: [],
                handMergeRefusal: { kind: "conflictMarkersLeft" },
            },
        }),
    ).memory;

    it("resends the decision that asked, agreeing to drop the XML merged by hand", () => {
        expect(chooseOn(asked, "dropHandMerges")).toStrictEqual({
            memory: asked,
            send: { request: keepTask, dropsHandMerges: true },
            card: { kind: "keep" },
        });
    });

    it("reopens the merge editor on the refused text from where it was asked for", () => {
        expect(chooseOn(refusedHandMerge, "editAgain").send).toStrictEqual({
            request: { kind: "mergeXml", elementId: "Task_Remind", origin: "menu", resume: true },
            dropsHandMerges: false,
        });
    });

    it("forgets the outcome and closes the card on a dismiss, so it does not show again", () => {
        const { memory, send, card } = chooseOn(asked, "dismiss");

        expect(card).toStrictEqual({ kind: "close" });
        expect(send).toBeUndefined();
        expect(outcomeToShowAt(memory, "Task_Remind")).toBeUndefined();
    });

    it("sends nothing it has no outcome for", () => {
        expect(chooseOn(EMPTY_OUTCOME_MEMORY, "editAgain")).toStrictEqual({
            memory: EMPTY_OUTCOME_MEMORY,
            card: { kind: "keep" },
        });
        expect(chooseOn(refusedHandMerge, "dropHandMerges").send).toBeUndefined();
    });
});
