import { describe, expect, it } from "vitest";

import type {
    MergePaneBlock,
    MergePaneOutcome,
    MergePanePickable,
} from "@miragon/bpmn-modeler-shared";

import type { MergeActedDecision, MergeXmlRequest } from "./mergeActedDecision";
import { outcomeToShowAt, rowOutcome } from "./mergeOutcomeCardRules";
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
    lack: "removed",
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

const pickedEntry = (
    id: string,
    keptSide: "current" | "incoming" = "incoming",
): MergePanePickable => ({ id, pick: { keptSide, scope: "element" } });

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
            pickable: [pickedEntry("Task_Remind")],
            restoreOffer: offer,
        });

        const { memory, answer } = answerStates(
            shown.memory,
            states({
                lastOutcome: outcome,
                pickable: [pickedEntry("Task_Remind", "current")],
            }),
        );

        expect(answer).toBe("forget");
        expect(memory.latest).toBeUndefined();
    });

    it("takes the partner's change of another element's pick for newer, though its outcome reads the same", () => {
        const outcome = applied("pick", "Task_Remind");
        const shown = sendAndAnswer(EMPTY_OUTCOME_MEMORY, keepTask, outcome, {
            pickable: [pickedEntry("Message_1")],
        });

        const { answer } = answerStates(
            shown.memory,
            states({ lastOutcome: outcome, pickable: [pickedEntry("Message_1", "current")] }),
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

    it("shows the host's outcome of an undo with the refused decision it freed", () => {
        const freeing = {
            ...applied("unpick", "Flow_1"),
            freed: { action: "leaveOut", elementId: "Task_Remind" },
        } as const;
        const refused = sendAndAnswer(
            EMPTY_OUTCOME_MEMORY,
            leaveOutTask,
            refusedLeaveOut([picked("Flow_1")]),
        );

        const { memory } = sendAndAnswer(refused.memory, undo("Flow_1"), freeing);

        expect(memory.latest).toStrictEqual({ outcome: freeing, acted: undo("Flow_1") });
    });

    it("frees nothing the host does not name, though the pane took back the pick that blocked its refusal", () => {
        const refused = sendAndAnswer(
            EMPTY_OUTCOME_MEMORY,
            leaveOutTask,
            refusedLeaveOut([picked("Flow_1")]),
            { pickable: [pickedEntry("Flow_1")] },
        );
        const pickedAnother = sendAndAnswer(
            refused.memory,
            { ...keepTask, elementId: "Flow_2" },
            applied("pick", "Flow_2"),
            { pickable: [pickedEntry("Flow_1"), pickedEntry("Flow_2")] },
        );

        const undone = sendAndAnswer(
            pickedAnother.memory,
            undo("Flow_1"),
            applied("unpick", "Flow_1"),
            { pickable: [pickedEntry("Flow_2")] },
        );

        expect(undone.memory.latest).toStrictEqual({
            outcome: applied("unpick", "Flow_1"),
            acted: undo("Flow_1"),
        });
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
    const mergedEntry: MergePanePickable = {
        id: "Task_Remind",
        pick: { keptSide: "incoming", scope: "element", mergedByHand: true },
    };
    const opened = answerStates(
        rememberSent(EMPTY_OUTCOME_MEMORY, mergeXml),
        states({ pickable: [pickedEntry("Task_Remind")] }),
    ).memory;

    it("shows the finished merge as the answer, with the request", () => {
        const { memory, answer } = answerStates(
            opened,
            states({ lastOutcome: accepted, pickable: [mergedEntry] }),
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
            states({ lastOutcome: { ...accepted, finish: 1 }, pickable: [mergedEntry] }),
        ).memory;
        const editing = rememberSent(shown, mergeXml);

        const repeated = answerStates(
            editing,
            states({ lastOutcome: { ...accepted, finish: 2 }, pickable: [mergedEntry] }),
        );
        const partners = answerStates(
            repeated.memory,
            states({ lastOutcome: { ...refusedText, finish: 3 }, pickable: [mergedEntry] }),
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

    it("tells a merge by hand from the plain pick by the pick's flag", () => {
        const shown = answerStates(opened, states({ lastOutcome: accepted })).memory;

        expect(
            answerStates(shown, states({ lastOutcome: accepted, pickable: [mergedEntry] })).answer,
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
