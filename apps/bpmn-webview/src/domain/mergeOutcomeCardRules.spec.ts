import { describe, expect, it } from "vitest";

import type { MergePaneOutcome } from "@miragon/bpmn-modeler-shared";

import type { MergeActedDecision } from "./mergeActedDecision";
import {
    cardOnAnswer,
    cardOnSelection,
    chooseOn,
    outcomeToShowAt,
    rowOutcome,
} from "./mergeOutcomeCardRules";
import {
    answerStates,
    EMPTY_OUTCOME_MEMORY,
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

describe("cardOnAnswer", () => {
    it("shows this pane's new outcome of a decision made on the canvas", () => {
        const { memory, answer } = sendAndAnswer(
            EMPTY_OUTCOME_MEMORY,
            keepTask,
            applied("pick", "Task_Remind"),
        );

        expect(cardOnAnswer(memory, answer)).toStrictEqual({ close: true, show: memory.latest });
    });

    it("closes the card, showing none, for a decision made in the menu, which says it in the row", () => {
        const { memory, answer } = sendAndAnswer(
            EMPTY_OUTCOME_MEMORY,
            undo("Message_1", "menu"),
            applied("unpick", "Message_1"),
        );

        expect(answer).toBe("show");
        expect(cardOnAnswer(memory, answer)).toStrictEqual({ close: true });
    });

    it("closes the card for the partner's newer outcome and keeps it while nothing is new", () => {
        expect(cardOnAnswer(EMPTY_OUTCOME_MEMORY, "forget")).toStrictEqual({ close: true });
        expect(cardOnAnswer(EMPTY_OUTCOME_MEMORY, "keep")).toStrictEqual({ close: false });
    });
});

describe("cardOnSelection", () => {
    const { memory } = sendAndAnswer(
        EMPTY_OUTCOME_MEMORY,
        keepTask,
        applied("pick", "Task_Remind"),
    );

    it.each<[string, string | undefined, string | undefined, ReturnType<typeof cardOnSelection>]>([
        ["closes it on another element", "Task_Remind", "Task_Other", { close: true }],
        ["closes it on no selection", "Task_Remind", undefined, { close: true }],
        ["leaves it on its element", "Task_Remind", "Task_Remind", { close: false }],
        [
            "shows it again on its element",
            undefined,
            "Task_Remind",
            { close: false, show: memory.latest },
        ],
        ["does nothing where no card shows or belongs", undefined, "Task_Other", { close: false }],
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
            close: false,
        });
    });

    it("reopens the merge editor on the refused text from where it was asked for", () => {
        expect(chooseOn(refusedHandMerge, "editAgain").send).toStrictEqual({
            request: { kind: "mergeXml", elementId: "Task_Remind", origin: "menu", resume: true },
            dropsHandMerges: false,
        });
    });

    it("forgets the outcome and closes the card on a dismiss, so it does not show again", () => {
        const { memory, send, close } = chooseOn(asked, "dismiss");

        expect(close).toBe(true);
        expect(send).toBeUndefined();
        expect(outcomeToShowAt(memory, "Task_Remind")).toBeUndefined();
    });

    it("sends nothing it has no outcome for", () => {
        expect(chooseOn(EMPTY_OUTCOME_MEMORY, "editAgain")).toStrictEqual({
            memory: EMPTY_OUTCOME_MEMORY,
            close: false,
        });
        expect(chooseOn(refusedHandMerge, "dropHandMerges").send).toBeUndefined();
    });
});
