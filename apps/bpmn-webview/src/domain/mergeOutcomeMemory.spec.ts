import { describe, expect, it } from "vitest";

import type { MergePaneBlock, MergePaneOutcome } from "@miragon/bpmn-modeler-shared";

import type { MergeActedDecision } from "./mergeActedDecision";
import {
    answerStates,
    cardOnAnswer,
    cardOnSelection,
    EMPTY_OUTCOME_MEMORY,
    headerOutcome,
    type MergeOutcomeMemory,
    type MergeOutcomeStates,
    outcomeToShowAt,
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
const undo = (elementId: string, origin: "canvas" | "legend" = "canvas"): MergeActedDecision => ({
    kind: "undo",
    elementId,
    scope: "element",
    origin,
});

const states = (overrides: Partial<MergeOutcomeStates> = {}): MergeOutcomeStates => ({
    badges: [],
    picksNotDrawn: [],
    allSteps: [
        { id: "Task_Remind", shapeless: false, onThisPane: true, onOtherPane: false },
        { id: "Message_1", shapeless: true, onThisPane: true, onOtherPane: true },
    ],
    ...overrides,
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
            "a decision made in the legend",
            sendAndAnswer(
                EMPTY_OUTCOME_MEMORY,
                undo("Task_Remind", "legend"),
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

    it("closes the card, showing none, for a decision made in the legend, which says it there", () => {
        const { memory, answer } = sendAndAnswer(
            EMPTY_OUTCOME_MEMORY,
            undo("Message_1", "legend"),
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

describe("headerOutcome", () => {
    const offer = { connections: ["Flow_1"], removedBy: "current" } as const;

    it("shows the last outcome and offer of a shape-less element on either pane", () => {
        const lastOutcome = applied("pick", "Message_1");

        expect(
            headerOutcome(
                EMPTY_OUTCOME_MEMORY,
                states({ lastOutcome, restoreOffer: { elementId: "Message_1", ...offer } }),
            ),
        ).toStrictEqual({ lastOutcome, restoreOffer: { elementId: "Message_1", ...offer } });
    });

    it("shows no outcome or offer of an element a canvas draws, where the card says it", () => {
        const lastOutcome = applied("pick", "Task_Remind");
        const { memory } = sendAndAnswer(EMPTY_OUTCOME_MEMORY, keepTask, lastOutcome);

        expect(
            headerOutcome(
                memory,
                states({ lastOutcome, restoreOffer: { elementId: "Task_Remind", ...offer } }),
            ),
        ).toStrictEqual({});
    });

    it("shows what an undo from the legend's list of picks did, on the pane that sent it", () => {
        const lastOutcome = applied("unpick", "Task_Remind");
        const { memory } = sendAndAnswer(
            EMPTY_OUTCOME_MEMORY,
            undo("Task_Remind", "legend"),
            lastOutcome,
        );

        expect(headerOutcome(memory, states({ lastOutcome }))).toStrictEqual({ lastOutcome });
        expect(headerOutcome(EMPTY_OUTCOME_MEMORY, states({ lastOutcome }))).toStrictEqual({});
    });
});
