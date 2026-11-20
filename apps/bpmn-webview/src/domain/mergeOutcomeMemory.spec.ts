import { describe, expect, it } from "vitest";

import type {
    MergePaneBlock,
    MergePaneOutcome,
    MergePaneShapelessRow,
} from "@miragon/bpmn-modeler-shared";

import type { MergeActedDecision, MergeXmlRequest } from "./mergeActedDecision";
import {
    answerStates,
    cardOnAnswer,
    cardOnSelection,
    chooseOn,
    EMPTY_OUTCOME_MEMORY,
    type MergeOutcomeMemory,
    type MergeOutcomeStates,
    outcomeToShowAt,
    rememberSent,
    rowOutcome,
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

const picked = (elementId: string): MergePaneBlock => ({
    elementId,
    targetId: "Task_Remind",
    obstacle: "dependentPicked",
});

const refusedLeaveOut = (blockedBy: MergePaneBlock[]): MergePaneOutcome => ({
    applied: false,
    action: "leaveOut",
    elementId: "Task_Remind",
    blockedBy,
});

const keepTask: MergeActedDecision = {
    kind: "keep",
    elementId: "Task_Remind",
    scope: "element",
    side: "incoming",
    origin: "canvas",
};
const leaveOutTask: MergeActedDecision = {
    kind: "leaveOut",
    elementId: "Task_Remind",
    side: "current",
    otherSideLacks: "removed",
    origin: "canvas",
};
const undo = (elementId: string, origin: "canvas" | "menu" = "canvas"): MergeActedDecision => ({
    kind: "undo",
    elementId,
    scope: "element",
    origin,
});

const states = (overrides: Partial<MergeOutcomeStates> = {}): MergeOutcomeStates => ({
    badges: [],
    picksNotDrawn: [],
    shapelessRows: [],
    allSteps: [
        { id: "Task_Remind", shapeless: false, onThisPane: true, onOtherPane: false },
        { id: "Message_1", shapeless: true, onThisPane: true, onOtherPane: true },
    ],
    ...overrides,
});

const pickedRow = (
    id: string,
    keptSide: "current" | "incoming" = "incoming",
): MergePaneShapelessRow => ({
    id,
    type: "bpmn:Message",
    marker: "takenFromOtherSide",
    pick: { keptSide, scope: "element" },
    differences: [],
});

const badge = (id: string) =>
    ({ id, kind: "keptHere", keptSide: "incoming", scope: "element" }) as const;

/** Sends `acted` and lets the host answer with `lastOutcome`. */
function sendAndAnswer(
    memory: MergeOutcomeMemory,
    acted: MergeActedDecision,
    lastOutcome: MergePaneOutcome,
    overrides: Partial<MergeOutcomeStates> = {},
) {
    return answerStates(rememberSent(memory, acted), states({ lastOutcome, ...overrides }));
}

describe("answerStates", () => {
    it("shows the outcome that answers the decision the pane sent, with that decision", () => {
        const outcome = applied("pick", "Task_Remind");

        const { memory, answer } = sendAndAnswer(EMPTY_OUTCOME_MEMORY, keepTask, outcome);

        expect(answer).toBe("show");
        expect(memory.latest).toStrictEqual({ outcome, acted: keepTask });
        expect(memory.sent).toBeUndefined();
    });

    it.each<[string, MergeActedDecision, MergePaneOutcome]>([
        ["a leave-out by its leave-out", leaveOutTask, applied("leaveOut", "Task_Remind")],
        ["a refused pick by its refusal", keepTask, refusedLeaveOut([])],
        ["an undo by its undo", undo("Task_Remind"), applied("unpick", "Task_Remind")],
    ])("answers %s", (_case, acted, outcome) => {
        expect(sendAndAnswer(EMPTY_OUTCOME_MEMORY, acted, outcome).answer).toBe("show");
    });

    it.each<[string, MergeActedDecision, MergePaneOutcome]>([
        ["another element", keepTask, applied("pick", "Task_Other")],
        ["an undo for a pick", keepTask, applied("unpick", "Task_Remind")],
        [
            "a pick for an undo",
            undo("Task_Remind"),
            applied("pick", "Task_Remind", { pulledIn: ["Flow_1"] }),
        ],
        ["a merge by hand for a pick", keepTask, applied("mergeByHand", "Task_Remind")],
        [
            "a discarded merge by hand for a pick",
            keepTask,
            {
                applied: false,
                action: "mergeByHand",
                elementId: "Task_Remind",
                blockedBy: [],
                discarded: true,
            },
        ],
    ])("takes an outcome of %s for the partner's and forgets its own", (_case, acted, outcome) => {
        const shown = sendAndAnswer(EMPTY_OUTCOME_MEMORY, keepTask, applied("pick", "Task_Remind"));

        const { memory, answer } = sendAndAnswer(shown.memory, acted, outcome);

        expect(answer).toBe("forget");
        expect(memory.latest).toBeUndefined();
        expect(memory.sent).toStrictEqual(acted);
    });

    it("keeps its outcome while the states repeat the last one, as after the partner reloads", () => {
        const outcome = applied("pick", "Task_Remind");
        const shown = sendAndAnswer(EMPTY_OUTCOME_MEMORY, keepTask, outcome);

        const { memory, answer } = answerStates(shown.memory, states({ lastOutcome: outcome }));

        expect(answer).toBe("keep");
        expect(memory.latest).toStrictEqual({ outcome, acted: keepTask });
    });

    it("takes the partner's keep of the same element from the other side for newer, though its outcome reads the same", () => {
        const outcome = applied("pick", "Task_Remind");
        const offer = {
            elementId: "Task_Remind",
            connections: ["Flow_1"],
            removedBy: "current",
        } as const;
        const shown = sendAndAnswer(EMPTY_OUTCOME_MEMORY, keepTask, outcome, {
            badges: [badge("Task_Remind")],
            restoreOffer: offer,
        });

        const { memory, answer } = answerStates(
            shown.memory,
            states({
                lastOutcome: outcome,
                badges: [
                    {
                        id: "Task_Remind",
                        kind: "replacedHere",
                        keptSide: "current",
                        scope: "element",
                    },
                ],
            }),
        );

        expect(answer).toBe("forget");
        expect(memory.latest).toBeUndefined();
    });

    it("takes the partner's change of a pick only a menu row lists for newer, though its outcome reads the same", () => {
        const outcome = applied("pick", "Task_Remind");
        const shown = sendAndAnswer(EMPTY_OUTCOME_MEMORY, keepTask, outcome, {
            shapelessRows: [pickedRow("Message_1")],
        });

        const { answer } = answerStates(
            shown.memory,
            states({ lastOutcome: outcome, shapelessRows: [pickedRow("Message_1", "current")] }),
        );

        expect(answer).toBe("forget");
    });

    it("forgets nothing it does not have when a reloaded pane gets the last outcome", () => {
        const { memory, answer } = answerStates(
            EMPTY_OUTCOME_MEMORY,
            states({ lastOutcome: applied("pick", "Task_Remind") }),
        );

        expect(answer).toBe("forget");
        expect(memory.latest).toBeUndefined();
        expect(
            answerStates(memory, states({ lastOutcome: applied("pick", "Task_Remind") })).answer,
        ).toBe("keep");
    });

    it("notes the refusal an undo freed: it undid a blocker and no blocking pick is left", () => {
        const refusal = refusedLeaveOut([picked("Flow_1"), picked("Flow_2")]);
        const refused = sendAndAnswer(EMPTY_OUTCOME_MEMORY, leaveOutTask, refusal, {
            badges: [badge("Flow_1"), badge("Flow_2")],
        });

        const first = sendAndAnswer(refused.memory, undo("Flow_1"), applied("unpick", "Flow_1"), {
            badges: [badge("Flow_2")],
        });
        const second = sendAndAnswer(first.memory, undo("Flow_2"), applied("unpick", "Flow_2"));

        expect(first.memory.latest?.lifted).toBeUndefined();
        expect(second.memory.latest?.lifted).toStrictEqual(refusal);
        expect(second.memory.refused).toBeUndefined();
    });

    it.each<[string, MergePaneOutcome, MergeActedDecision, Partial<MergeOutcomeStates>]>([
        [
            "a blocking pick the pane cannot draw is left",
            applied("unpick", "Flow_1"),
            undo("Flow_1"),
            { picksNotDrawn: [{ id: "Flow_2", keptSide: "incoming", scope: "element" }] },
        ],
        ["the undo was no blocker", applied("unpick", "Flow_9"), undo("Flow_9"), {}],
    ])("notes no freed refusal where %s", (_case, outcome, acted, overrides) => {
        const refused = sendAndAnswer(
            EMPTY_OUTCOME_MEMORY,
            leaveOutTask,
            refusedLeaveOut([picked("Flow_1"), picked("Flow_2")]),
        );

        expect(
            sendAndAnswer(refused.memory, acted, outcome, overrides).memory.latest?.lifted,
        ).toBeUndefined();
    });

    it("notes no freed refusal where a blocking pick only a menu row lists is left", () => {
        const refused = sendAndAnswer(
            EMPTY_OUTCOME_MEMORY,
            leaveOutTask,
            refusedLeaveOut([picked("Flow_1"), picked("Message_1")]),
        );

        expect(
            sendAndAnswer(refused.memory, undo("Flow_1"), applied("unpick", "Flow_1"), {
                shapelessRows: [pickedRow("Message_1")],
            }).memory.latest?.lifted,
        ).toBeUndefined();
    });

    it("notes no freed refusal where a reason was no pick an undo takes back", () => {
        const refused = sendAndAnswer(
            EMPTY_OUTCOME_MEMORY,
            leaveOutTask,
            refusedLeaveOut([
                picked("Flow_1"),
                { elementId: "Task_Remind", targetId: "Data_1", obstacle: "targetInNoVersion" },
            ]),
        );

        expect(
            sendAndAnswer(refused.memory, undo("Flow_1"), applied("unpick", "Flow_1")).memory.latest
                ?.lifted,
        ).toBeUndefined();
    });
});

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

describe("a merge by hand this pane asked for", () => {
    const mergeXml: MergeXmlRequest = {
        kind: "mergeXml",
        elementId: "Task_Remind",
        origin: "canvas",
    };
    const accepted = applied("mergeByHand", "Task_Remind");
    const refusedText: MergePaneOutcome = {
        applied: false,
        action: "mergeByHand",
        elementId: "Task_Remind",
        blockedBy: [],
        handMergeRefusal: { kind: "conflictMarkersLeft" },
    };
    const mergedBadge = { ...badge("Task_Remind"), mergedByHand: true } as const;
    const opened = answerStates(
        rememberSent(EMPTY_OUTCOME_MEMORY, mergeXml),
        states({ badges: [badge("Task_Remind")] }),
    ).memory;

    it("shows the finished merge as the answer, with the request", () => {
        const { memory, answer } = answerStates(
            opened,
            states({ lastOutcome: accepted, badges: [mergedBadge] }),
        );

        expect(answer).toBe("show");
        expect(memory.latest).toStrictEqual({ outcome: accepted, acted: mergeXml });
        expect(memory.handMergesSent).toStrictEqual([]);
    });

    it("still shows it after picks this pane sent while the editor was open", () => {
        const picked = sendAndAnswer(opened, keepTask, applied("pick", "Task_Other"));
        const answeredPick = sendAndAnswer(
            picked.memory,
            { ...keepTask, elementId: "Task_Other" },
            applied("pick", "Task_Other"),
        );

        const { answer, memory } = answerStates(
            answeredPick.memory,
            states({ lastOutcome: refusedText }),
        );

        expect(answer).toBe("show");
        expect(memory.latest?.acted).toStrictEqual(mergeXml);
    });

    it("keeps the merges it asked for through the partner's newer outcome", () => {
        const { memory } = answerStates(
            opened,
            states({ lastOutcome: applied("pick", "Task_Other") }),
        );

        expect(memory.handMergesSent).toStrictEqual([mergeXml]);
    });

    it("takes no repeat of the last outcome for the answer, as when Edit again sends no state", () => {
        const shown = answerStates(opened, states({ lastOutcome: refusedText })).memory;
        const editAgain = rememberSent(shown, { ...mergeXml, resume: true });

        const { answer, memory } = answerStates(editAgain, states({ lastOutcome: refusedText }));

        expect(answer).toBe("keep");
        expect(memory.latest).toStrictEqual(shown.latest);
    });

    it("answers a finish that repeats the last one word for word by its count, so it claims no later finish of the partner", () => {
        const shown = answerStates(
            opened,
            states({ lastOutcome: { ...accepted, finish: 1 }, badges: [mergedBadge] }),
        ).memory;
        const editing = rememberSent(shown, mergeXml);

        const repeated = answerStates(
            editing,
            states({ lastOutcome: { ...accepted, finish: 2 }, badges: [mergedBadge] }),
        );
        const partners = answerStates(
            repeated.memory,
            states({ lastOutcome: { ...refusedText, finish: 3 }, badges: [mergedBadge] }),
        );

        expect(repeated.answer).toBe("show");
        expect(repeated.memory.handMergesSent).toStrictEqual([]);
        expect(partners.answer).toBe("forget");
    });

    it("leaves a merge it did not ask for to the pane that did", () => {
        expect(answerStates(EMPTY_OUTCOME_MEMORY, states({ lastOutcome: accepted })).answer).toBe(
            "forget",
        );
    });

    it("tells a merge by hand from the plain pick by the badge's flag", () => {
        const shown = answerStates(opened, states({ lastOutcome: accepted })).memory;

        expect(
            answerStates(shown, states({ lastOutcome: accepted, badges: [mergedBadge] })).answer,
        ).toBe("forget");
    });

    it("shows a merge asked for in a menu row in that row, not on the card", () => {
        const fromRow = answerStates(
            rememberSent(EMPTY_OUTCOME_MEMORY, { ...mergeXml, origin: "menu" }),
            states(),
        ).memory;

        const { memory } = answerStates(fromRow, states({ lastOutcome: accepted }));

        expect(rowOutcome(memory)?.outcome).toStrictEqual(accepted);
        expect(outcomeToShowAt(memory, "Task_Remind")).toBeUndefined();
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
