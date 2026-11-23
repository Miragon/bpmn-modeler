import { describe, expect, it } from "vitest";

import {
    mergeElement,
    mergeResult,
    mergeResultWithoutBase,
    refersTo,
} from "../../__fixtures__/mergeResultBuilder";
import { MergeDecisions } from "./mergeDecisions";
import type {
    ElementState,
    MergeElement,
    MergeResult,
    MergeSide,
} from "../../kernel/domain/mergeResult";
import { restoredFlowDefaultsOf } from "./removedWith";

const process = mergeElement("Process", "unchanged", { type: "bpmn:Process" });

const sequenceFlow = (
    id: string,
    source: string,
    target: string,
    state: ElementState,
    parts: readonly string[] = [],
) =>
    mergeElement(id, state, {
        type: "bpmn:SequenceFlow",
        parent: "Process",
        parts,
        references: [
            refersTo("bpmn:SequenceFlow#sourceRef", source),
            refersTo("bpmn:SequenceFlow#targetRef", target),
        ],
    });

/** Current removed Task_Reject with the flows into and out of it; incoming kept all of them. */
const removedWithItsFlows = (endState: ElementState = "unchanged", ...more: MergeElement[]) =>
    mergeResult(
        process,
        mergeElement("Gateway", "unchanged", { parent: "Process" }),
        mergeElement("End", endState, { parent: "Process" }),
        mergeElement("Task_Reject", "removedByCurrent", { parent: "Process" }),
        sequenceFlow("Flow_No", "Gateway", "Task_Reject", "removedByCurrent"),
        sequenceFlow("Flow_Rejected", "Task_Reject", "End", "removedByCurrent"),
        ...more,
    );

function stateOf(decisions: MergeDecisions) {
    return decisions.result.elements.map(({ id }) => [
        id,
        decisions.sideOf(id),
        decisions.isInResult(id),
        decisions.originOf(id),
    ]);
}

describe("MergeDecisions.pickWithRemoved", () => {
    it("offers the flows the other side removed with the element in the outcome of a plain pick", () => {
        const decisions = MergeDecisions.from(removedWithItsFlows());

        expect(decisions.pick("Task_Reject", "incoming")).toEqual({
            applied: true,
            pulledIn: [],
            dropped: [],
            connectionsLeftOut: ["Flow_No", "Flow_Rejected"],
        });
        expect(decisions.removedWithLeftOut("Task_Reject", "incoming").connections).toEqual([
            "Flow_No",
            "Flow_Rejected",
        ]);
    });

    it("keeps the element and those flows as picks on its side in one step", () => {
        const decisions = MergeDecisions.from(removedWithItsFlows());

        expect(decisions.pickWithRemoved("Task_Reject", "incoming")).toEqual({
            applied: true,
            pulledIn: [],
            dropped: [],
        });

        for (const id of ["Task_Reject", "Flow_No", "Flow_Rejected"]) {
            expect(decisions.sideOf(id)).toBe("incoming");
            expect(decisions.isInResult(id)).toBe(true);
            expect(decisions.originOf(id)).toBe("picked");
        }
        expect(decisions.removedWithLeftOut("Task_Reject", "incoming").connections).toEqual([]);
    });

    it("leaves out a flow whose other end the result does not hold", () => {
        const decisions = MergeDecisions.from(removedWithItsFlows("removedByCurrent"));

        expect(decisions.removedWithLeftOut("Task_Reject", "incoming").connections).toEqual([
            "Flow_No",
        ]);
        decisions.pickWithRemoved("Task_Reject", "incoming");

        expect(decisions.isInResult("End")).toBe(false);
        expect(decisions.isInResult("Flow_Rejected")).toBe(false);
    });

    it.each([
        { messageState: "unchanged", offered: ["Flow_Order"] },
        { messageState: "removedByCurrent", offered: [] },
    ] as const)(
        "offers a message flow only when the result holds its message: $messageState message",
        ({ messageState, offered }) => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    mergeElement("Collaboration", "unchanged", { type: "bpmn:Collaboration" }),
                    mergeElement("Task_Send", "removedByCurrent", { parent: "Collaboration" }),
                    mergeElement("Task_Receive", "unchanged", { parent: "Collaboration" }),
                    mergeElement("Message_Order", messageState, { type: "bpmn:Message" }),
                    mergeElement("Flow_Order", "removedByCurrent", {
                        type: "bpmn:MessageFlow",
                        parent: "Collaboration",
                        references: [
                            refersTo("bpmn:MessageFlow#sourceRef", "Task_Send"),
                            refersTo("bpmn:MessageFlow#targetRef", "Task_Receive"),
                            refersTo("bpmn:MessageFlow#messageRef", "Message_Order"),
                        ],
                    }),
                ),
            );

            expect(decisions.removedWithLeftOut("Task_Send", "incoming").connections).toEqual(
                offered,
            );
            decisions.pickWithRemoved("Task_Send", "incoming");

            expect(decisions.isInResult("Message_Order")).toBe(messageState === "unchanged");
        },
    );

    it("leaves out a flow the user picked away", () => {
        const decisions = MergeDecisions.from(removedWithItsFlows());
        decisions.pick("Flow_No", "current");

        decisions.pickWithRemoved("Task_Reject", "incoming");

        expect(decisions.sideOf("Flow_No")).toBe("current");
        expect(decisions.isInResult("Flow_No")).toBe(false);
        expect(decisions.isInResult("Flow_Rejected")).toBe(true);
    });

    it("does not offer a flow the side added, which the pick brings in anyway", () => {
        const decisions = MergeDecisions.from(
            removedWithItsFlows(
                "unchanged",
                mergeElement("End_Escalated", "addedByIncoming", { parent: "Process" }),
                sequenceFlow("Flow_Escalate", "Task_Reject", "End_Escalated", "addedByIncoming"),
            ),
        );

        expect(decisions.removedWithLeftOut("Task_Reject", "incoming").connections).toEqual([
            "Flow_No",
            "Flow_Rejected",
        ]);
        decisions.pickWithRemoved("Task_Reject", "incoming");

        expect(decisions.isInResult("Flow_Escalate")).toBe(true);
        expect(decisions.originOf("Flow_Escalate")).toBe("automatic");
    });

    it.each<[string, MergeResult, string, MergeSide]>([
        [
            "an element the other side did not remove",
            mergeResult(
                process,
                mergeElement("A", "unchanged", { parent: "Process" }),
                mergeElement("Task", "takenFromIncoming", { parent: "Process" }),
                sequenceFlow("F", "A", "Task", "removedByCurrent"),
            ),
            "Task",
            "incoming",
        ],
        ["a pick to the removing side", removedWithItsFlows(), "Task_Reject", "current"],
        [
            "a result without a base",
            mergeResultWithoutBase(
                process,
                mergeElement("A", "differs", { parent: "Process" }),
                mergeElement("Task", "onlyInIncoming", { parent: "Process" }),
                sequenceFlow("F", "A", "Task", "onlyInIncoming"),
            ),
            "Task",
            "incoming",
        ],
    ])("offers nothing for %s", (_name, result, id, side) => {
        const decisions = MergeDecisions.from(result);

        expect(decisions.removedWithLeftOut(id, side).connections).toEqual([]);
        expect(decisions.pick(id, side)).not.toHaveProperty("connectionsLeftOut");
    });

    it("is refused as a whole and changes nothing when a flow cannot be kept", () => {
        const withPart = MergeDecisions.from(
            mergeResult(
                process,
                mergeElement("Gateway", "unchanged", { parent: "Process" }),
                mergeElement("End", "unchanged", { parent: "Process" }),
                mergeElement("Task_Reject", "removedByCurrent", { parent: "Process" }),
                sequenceFlow("Flow_No", "Gateway", "Task_Reject", "removedByCurrent", ["Cond_1"]),
                sequenceFlow("Flow_Rejected", "Task_Reject", "End", "removedByCurrent"),
                mergeElement("X", "bothChanged", { parent: "Process", parts: ["Cond_1"] }),
            ),
        );
        expect(withPart.pick("X", "current").applied).toBe(true);
        const before = stateOf(withPart);

        const outcome = withPart.pickWithRemoved("Task_Reject", "incoming");

        expect(outcome.applied).toBe(false);
        expect("blockedBy" in outcome && outcome.blockedBy[0]?.reason.obstacle.kind).toBe(
            "idHeldByAnother",
        );
        expect(stateOf(withPart)).toEqual(before);
    });

    it("unpickWithRemoved returns the element and its flows to their automatic resolution", () => {
        const decisions = MergeDecisions.from(removedWithItsFlows());
        const before = stateOf(decisions);
        decisions.pickWithRemoved("Task_Reject", "incoming");

        expect(decisions.unpickWithRemoved("Task_Reject").applied).toBe(true);

        expect(stateOf(decisions)).toEqual(before);
    });

    it("unpick of the element alone keeps it as a consequence of its picked flows", () => {
        const decisions = MergeDecisions.from(removedWithItsFlows());
        decisions.pickWithRemoved("Task_Reject", "incoming");

        decisions.unpick("Task_Reject");

        expect(decisions.isInResult("Task_Reject")).toBe(true);
        expect(decisions.originOf("Task_Reject")).toBe("consequence");
    });

    it("unpickWithRemoved keeps a flow the user picked to the other side", () => {
        const decisions = MergeDecisions.from(removedWithItsFlows());
        decisions.pick("Task_Reject", "incoming");
        decisions.pick("Flow_No", "current");

        decisions.unpickWithRemoved("Task_Reject");

        expect(decisions.originOf("Flow_No")).toBe("picked");
        expect(decisions.sideOf("Task_Reject")).toBe("current");
    });
});

describe("the boundary events the other side removed with a kept activity", () => {
    const boundaryEvent = (id: string, host: string, state: ElementState, error?: string) =>
        mergeElement(id, state, {
            type: "bpmn:BoundaryEvent",
            parent: "Process",
            references: [
                refersTo("bpmn:BoundaryEvent#attachedToRef", host),
                ...(error === undefined
                    ? []
                    : [refersTo("bpmn:ErrorEventDefinition#errorRef", error)]),
            ],
        });

    /** Current removed Task_Pay with its flows, its timer Timer_Pay and the timer's flow; incoming kept them all. */
    const removedWithItsTimer = ({
        reminderState = "unchanged",
        timerState = "removedByCurrent",
        more = [],
    }: {
        reminderState?: ElementState;
        timerState?: ElementState;
        more?: readonly MergeElement[];
    } = {}) =>
        mergeResult(
            process,
            mergeElement("Start", "unchanged", { parent: "Process" }),
            mergeElement("End", "unchanged", { parent: "Process" }),
            mergeElement("Task_Remind", reminderState, { parent: "Process" }),
            mergeElement("Task_Pay", "removedByCurrent", { parent: "Process" }),
            sequenceFlow("Flow_In", "Start", "Task_Pay", "removedByCurrent"),
            sequenceFlow("Flow_Out", "Task_Pay", "End", "removedByCurrent"),
            boundaryEvent("Timer_Pay", "Task_Pay", timerState),
            sequenceFlow("Flow_Timeout", "Timer_Pay", "Task_Remind", "removedByCurrent"),
            ...more,
        );

    it("offers the timer and its flow with the flows of the task", () => {
        const decisions = MergeDecisions.from(removedWithItsTimer());

        expect(decisions.pick("Task_Pay", "incoming")).toEqual({
            applied: true,
            pulledIn: [],
            dropped: [],
            connectionsLeftOut: ["Flow_In", "Flow_Out", "Flow_Timeout"],
            boundaryEventsLeftOut: ["Timer_Pay"],
        });
        expect(decisions.removedWithLeftOut("Task_Pay", "incoming")).toEqual({
            connections: ["Flow_In", "Flow_Out", "Flow_Timeout"],
            boundaryEvents: ["Timer_Pay"],
        });
    });

    it("keeps the timer and its flow as picks on the task's side in one step", () => {
        const decisions = MergeDecisions.from(removedWithItsTimer());

        expect(decisions.pickWithRemoved("Task_Pay", "incoming").applied).toBe(true);

        for (const id of ["Task_Pay", "Flow_In", "Flow_Out", "Timer_Pay", "Flow_Timeout"]) {
            expect([id, decisions.sideOf(id), decisions.originOf(id)]).toEqual([
                id,
                "incoming",
                "picked",
            ]);
            expect(decisions.isInResult(id)).toBe(true);
        }
        expect(decisions.removedWithLeftOut("Task_Pay", "incoming")).toEqual({
            connections: [],
            boundaryEvents: [],
        });
    });

    it("offers the timer without its flow when the flow's other end stays out", () => {
        const decisions = MergeDecisions.from(
            removedWithItsTimer({ reminderState: "removedByCurrent" }),
        );

        expect(decisions.removedWithLeftOut("Task_Pay", "incoming")).toEqual({
            connections: ["Flow_In", "Flow_Out"],
            boundaryEvents: ["Timer_Pay"],
        });
        decisions.pickWithRemoved("Task_Pay", "incoming");

        expect(decisions.isInResult("Timer_Pay")).toBe(true);
        expect(decisions.isInResult("Flow_Timeout")).toBe(false);
        expect(decisions.isInResult("Task_Remind")).toBe(false);
    });

    it("offers neither a boundary event that would bring back what it refers to nor its flow", () => {
        const decisions = MergeDecisions.from(
            removedWithItsTimer({
                more: [
                    mergeElement("Error_Declined", "removedByCurrent", { type: "bpmn:Error" }),
                    boundaryEvent("Error_Pay", "Task_Pay", "removedByCurrent", "Error_Declined"),
                    sequenceFlow("Flow_Declined", "Error_Pay", "End", "removedByCurrent"),
                ],
            }),
        );

        expect(decisions.removedWithLeftOut("Task_Pay", "incoming")).toEqual({
            connections: ["Flow_In", "Flow_Out", "Flow_Timeout"],
            boundaryEvents: ["Timer_Pay"],
        });
        decisions.pickWithRemoved("Task_Pay", "incoming");

        for (const id of ["Error_Declined", "Error_Pay", "Flow_Declined"]) {
            expect(decisions.isInResult(id)).toBe(false);
        }
    });

    it("leaves out a boundary event the user picked away, and its flow", () => {
        const decisions = MergeDecisions.from(removedWithItsTimer());
        decisions.pick("Timer_Pay", "current");

        expect(decisions.removedWithLeftOut("Task_Pay", "incoming")).toEqual({
            connections: ["Flow_In", "Flow_Out"],
            boundaryEvents: [],
        });
    });

    it("does not offer a boundary event the other side kept", () => {
        const decisions = MergeDecisions.from(removedWithItsTimer({ timerState: "unchanged" }));

        expect(decisions.removedWithLeftOut("Task_Pay", "incoming").boundaryEvents).toEqual([]);
    });

    it("offers once a flow from the timer back to its own task", () => {
        const decisions = MergeDecisions.from(
            removedWithItsTimer({
                more: [sequenceFlow("Flow_Retry", "Timer_Pay", "Task_Pay", "removedByCurrent")],
            }),
        );

        expect(decisions.removedWithLeftOut("Task_Pay", "incoming")).toEqual({
            connections: ["Flow_In", "Flow_Out", "Flow_Retry", "Flow_Timeout"],
            boundaryEvents: ["Timer_Pay"],
        });
    });

    it("offers the boundary events of an activity without flows of its own", () => {
        const decisions = MergeDecisions.from(
            mergeResult(
                process,
                mergeElement("Task_Pay", "removedByCurrent", { parent: "Process" }),
                boundaryEvent("Timer_Pay", "Task_Pay", "removedByCurrent"),
            ),
        );

        expect(decisions.pick("Task_Pay", "incoming")).toEqual({
            applied: true,
            pulledIn: [],
            dropped: [],
            boundaryEventsLeftOut: ["Timer_Pay"],
        });
    });

    it("unpickWithRemoved returns the timer and its flow to their automatic resolution", () => {
        const decisions = MergeDecisions.from(removedWithItsTimer());
        const before = stateOf(decisions);
        decisions.pickWithRemoved("Task_Pay", "incoming");

        expect(decisions.unpickWithRemoved("Task_Pay").applied).toBe(true);

        expect(stateOf(decisions)).toEqual(before);
    });

    it("unpickWithRemoved keeps a timer the user picked to the other side", () => {
        const decisions = MergeDecisions.from(removedWithItsTimer());
        decisions.pick("Task_Pay", "incoming");
        decisions.pick("Timer_Pay", "current");

        decisions.unpickWithRemoved("Task_Pay");

        expect(decisions.originOf("Timer_Pay")).toBe("picked");
        expect(decisions.sideOf("Task_Pay")).toBe("current");
    });
});

describe("the default a kept flow was of its source", () => {
    /**
     * Base's source names Flow_No as its default; current removed Task_Reject with its flows, and with them the
     * source's default or, given `currentDefault`, set another one; incoming kept them all.
     */
    const removedWithTheDefaultFlow = ({
        defaultProperty = "bpmn:ExclusiveGateway#default",
        currentDefault,
    }: { defaultProperty?: string; currentDefault?: string } = {}) =>
        mergeResult(
            process,
            mergeElement("Source", "takenFromCurrent", {
                type: defaultProperty.slice(0, defaultProperty.indexOf("#")),
                parent: "Process",
                references: [refersTo(defaultProperty, "Flow_No")],
                current: {
                    references:
                        currentDefault === undefined
                            ? []
                            : [refersTo(defaultProperty, currentDefault)],
                },
            }),
            mergeElement("End", "unchanged", { parent: "Process" }),
            mergeElement("Task_Reject", "removedByCurrent", { parent: "Process" }),
            sequenceFlow("Flow_No", "Source", "Task_Reject", "removedByCurrent"),
            sequenceFlow("Flow_Rejected", "Task_Reject", "End", "removedByCurrent"),
            sequenceFlow("Flow_Yes", "Source", "End", "unchanged"),
        );

    const flowDefaultsOf = (decisions: MergeDecisions) => {
        const { elements } = decisions.resolution();
        return restoredFlowDefaultsOf(decisions.result.elements, (id) => elements[id]);
    };

    it.each([
        "bpmn:ExclusiveGateway#default",
        "bpmn:InclusiveGateway#default",
        "bpmn:ComplexGateway#default",
        "bpmn:Activity#default",
    ])("restores %s with the flow the offer keeps, on the source current changed", (property) => {
        const decisions = MergeDecisions.from(
            removedWithTheDefaultFlow({ defaultProperty: property }),
        );

        decisions.pickWithRemoved("Task_Reject", "incoming");

        expect(decisions.sideOf("Source")).toBe("current");
        expect(flowDefaultsOf(decisions)).toEqual([
            { kind: "restored", source: "Source", flow: "Flow_No" },
        ]);
    });

    it("restores it whichever way the flow came back, a pick of the flow alone too", () => {
        const decisions = MergeDecisions.from(removedWithTheDefaultFlow());

        expect(decisions.pick("Flow_No", "incoming").applied).toBe(true);

        expect(decisions.isInResult("Task_Reject")).toBe(true);
        expect(flowDefaultsOf(decisions)).toEqual([
            { kind: "restored", source: "Source", flow: "Flow_No" },
        ]);
    });

    it("keeps the default current set instead and names it", () => {
        const decisions = MergeDecisions.from(
            removedWithTheDefaultFlow({ currentDefault: "Flow_Yes" }),
        );

        decisions.pickWithRemoved("Task_Reject", "incoming");

        expect(flowDefaultsOf(decisions)).toEqual([
            {
                kind: "otherDefaultKept",
                source: "Source",
                flow: "Flow_No",
                keptDefault: "Flow_Yes",
            },
        ]);
    });

    it.each<[string, (decisions: MergeDecisions) => void]>([
        ["the flow stays out", (decisions) => decisions.pick("Task_Reject", "incoming")],
        [
            "the source is taken from the side that names the flow",
            (decisions) => {
                decisions.pick("Source", "incoming");
                decisions.pickWithRemoved("Task_Reject", "incoming");
            },
        ],
        ["nothing is picked", () => undefined],
    ])("restores nothing when %s", (_name, decide) => {
        const decisions = MergeDecisions.from(removedWithTheDefaultFlow());

        decide(decisions);

        expect(flowDefaultsOf(decisions)).toEqual([]);
    });

    it("restores nothing for a flow the other side did not remove", () => {
        const decisions = MergeDecisions.from(
            mergeResult(
                process,
                mergeElement("Source", "takenFromCurrent", {
                    type: "bpmn:ExclusiveGateway",
                    parent: "Process",
                    references: [refersTo("bpmn:ExclusiveGateway#default", "Flow_No")],
                    current: { references: [] },
                }),
                mergeElement("End", "unchanged", { parent: "Process" }),
                sequenceFlow("Flow_No", "Source", "End", "unchanged"),
            ),
        );

        expect(flowDefaultsOf(decisions)).toEqual([]);
    });
});

describe("MergeDecisions.unpickWithContents", () => {
    const subProcess = () =>
        mergeResult(
            process,
            mergeElement("Sub", "bothChanged", { type: "bpmn:SubProcess", parent: "Process" }),
            mergeElement("Inner", "bothChanged", { parent: "Sub" }),
            mergeElement("Other", "takenFromCurrent", { parent: "Sub" }),
        );

    it("returns a container and everything kept with it to their automatic resolution", () => {
        const decisions = MergeDecisions.from(subProcess());
        const before = stateOf(decisions);
        decisions.pickWithContents("Sub", "incoming");

        expect(decisions.unpickWithContents("Sub").applied).toBe(true);

        expect(stateOf(decisions)).toEqual(before);
    });

    it("keeps a descendant the user picked to the other side", () => {
        const decisions = MergeDecisions.from(subProcess());
        decisions.pickWithContents("Sub", "incoming");
        decisions.pick("Inner", "current");

        decisions.unpickWithContents("Sub");

        expect(decisions.originOf("Sub")).toBeUndefined();
        expect(decisions.originOf("Inner")).toBe("picked");
        expect(decisions.sideOf("Inner")).toBe("current");
    });

    it("equals unpicking each element it takes back", () => {
        const together = MergeDecisions.from(subProcess());
        const oneByOne = MergeDecisions.from(subProcess());
        for (const decisions of [together, oneByOne]) {
            decisions.pickWithContents("Sub", "incoming");
        }

        together.unpickWithContents("Sub");
        for (const id of ["Sub", "Inner", "Other"]) oneByOne.unpick(id);

        expect(stateOf(together)).toEqual(stateOf(oneByOne));
    });
});
