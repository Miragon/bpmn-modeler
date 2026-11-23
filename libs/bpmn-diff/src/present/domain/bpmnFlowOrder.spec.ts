import { describe, expect, it } from "vitest";

import {
    buildFlowOrder,
    buildRemovedAnchors,
    sortIdsByOrder,
    type FlowPosition,
    type ModdleElement,
} from "./bpmnFlowOrder";

type Point = { x: number; y: number };

const element = (type: string, id: string, extra: Record<string, unknown> = {}): ModdleElement => ({
    $type: `bpmn:${type}`,
    id,
    ...extra,
});

const sequenceFlow = (
    id: string,
    source: ModdleElement | string,
    target: ModdleElement | string,
): ModdleElement => element("SequenceFlow", id, { sourceRef: source, targetRef: target });

const boundaryEvent = (id: string, host: ModdleElement | string): ModdleElement =>
    element("BoundaryEvent", id, { attachedToRef: host });

const processOf = (...flowElements: ModdleElement[]): ModdleElement =>
    element("Process", "Process_1", { flowElements });

/** `nodes` chained by sequence flows named `<flowPrefix>1`, `<flowPrefix>2`, … */
const chainedBy = (flowPrefix: string, ...nodes: ModdleElement[]): ModdleElement[] => [
    ...nodes,
    ...nodes
        .slice(1)
        .map((target, index) => sequenceFlow(`${flowPrefix}${index + 1}`, nodes[index], target)),
];

/** Parsed-definitions stand-in; `layout` maps ids to shape bounds or edge waypoints. */
function definitionsOf(
    rootElements: ModdleElement[],
    layout: Record<string, Point | Point[]> = {},
): ModdleElement {
    const planeElement = Object.entries(layout).map(([id, at]) =>
        Array.isArray(at)
            ? { bpmnElement: { id }, waypoint: at }
            : { bpmnElement: { id }, bounds: at },
    );
    return { $type: "bpmn:Definitions", rootElements, diagrams: [{ plane: { planeElement } }] };
}

const idsInFlowOrder = (order: ReadonlyMap<string, FlowPosition>): string[] =>
    [...order.entries()].sort(([, a], [, b]) => a.flowIndex - b.flowIndex).map(([id]) => id);

const at = (flowIndex: number, y = 0, x = 0): FlowPosition => ({ flowIndex, y, x });

describe("buildFlowOrder", () => {
    it("walks from the start event to the end event, each flow right after its source", () => {
        const start = element("StartEvent", "Start");
        const task = element("Task", "Task");
        const end = element("EndEvent", "End");

        const order = buildFlowOrder(
            definitionsOf([
                processOf(
                    end,
                    sequenceFlow("Flow_2", task, end),
                    task,
                    sequenceFlow("Flow_1", start, task),
                    start,
                ),
            ]),
        );

        expect(idsInFlowOrder(order)).toEqual(["Start", "Flow_1", "Task", "Flow_2", "End"]);
    });

    it("follows sequence flows whose references are plain ids", () => {
        const order = buildFlowOrder(
            definitionsOf([
                processOf(
                    element("EndEvent", "End"),
                    sequenceFlow("Flow_1", "Start", "End"),
                    element("StartEvent", "Start"),
                ),
            ]),
        );

        expect(idsInFlowOrder(order)).toEqual(["Start", "Flow_1", "End"]);
    });

    it("visits parallel branches top to bottom, then left to right", () => {
        const fork = element("ParallelGateway", "Fork");
        const lower = element("Task", "Lower");
        const upperRight = element("Task", "UpperRight");
        const upperLeft = element("Task", "UpperLeft");

        const order = buildFlowOrder(
            definitionsOf(
                [
                    processOf(
                        fork,
                        lower,
                        upperRight,
                        upperLeft,
                        sequenceFlow("ToLower", fork, lower),
                        sequenceFlow("ToUpperRight", fork, upperRight),
                        sequenceFlow("ToUpperLeft", fork, upperLeft),
                        element("StartEvent", "Start"),
                        sequenceFlow("ToFork", "Start", fork),
                    ),
                ],
                {
                    Lower: { x: 300, y: 300 },
                    UpperRight: { x: 400, y: 100 },
                    UpperLeft: { x: 300, y: 100 },
                },
            ),
        );

        expect(idsInFlowOrder(order)).toEqual([
            "Start",
            "ToFork",
            "Fork",
            "ToUpperLeft",
            "ToUpperRight",
            "ToLower",
            "UpperLeft",
            "UpperRight",
            "Lower",
        ]);
    });

    it("appends elements no start event reaches after the flow, in reading order", () => {
        const order = buildFlowOrder(
            definitionsOf(
                [
                    processOf(
                        element("Task", "Lonely_Bottom"),
                        element("Task", "Lonely_Top"),
                        element("StartEvent", "Start"),
                    ),
                ],
                {
                    Start: { x: 900, y: 900 },
                    Lonely_Bottom: { x: 0, y: 200 },
                    Lonely_Top: { x: 500, y: 100 },
                },
            ),
        );

        expect(idsInFlowOrder(order)).toEqual(["Start", "Lonely_Top", "Lonely_Bottom"]);
    });

    it("walks an embedded sub-process's content between its shape and its outgoing flow", () => {
        const subProcess = element("SubProcess", "Sub", {
            flowElements: chainedBy(
                "I",
                element("StartEvent", "InnerStart"),
                element("Task", "InnerTask"),
                element("EndEvent", "InnerEnd"),
            ),
        });

        const order = buildFlowOrder(
            definitionsOf([
                processOf(
                    ...chainedBy(
                        "F",
                        element("StartEvent", "Start"),
                        element("Task", "A"),
                        subProcess,
                        element("Task", "B"),
                        element("EndEvent", "End"),
                    ),
                ),
            ]),
        );

        expect(idsInFlowOrder(order)).toEqual([
            "Start",
            "F1",
            "A",
            "F2",
            "Sub",
            "InnerStart",
            "I1",
            "InnerTask",
            "I2",
            "InnerEnd",
            "F3",
            "B",
            "F4",
            "End",
        ]);
    });

    it("walks a nested sub-process as a block inside its parent's block", () => {
        const transaction = element("Transaction", "Inner", {
            flowElements: chainedBy(
                "I",
                element("StartEvent", "InnerStart"),
                element("EndEvent", "InnerEnd"),
            ),
        });
        const outer = element("SubProcess", "Outer", {
            flowElements: chainedBy(
                "O",
                element("StartEvent", "OuterStart"),
                transaction,
                element("EndEvent", "OuterEnd"),
            ),
        });

        const order = buildFlowOrder(
            definitionsOf([
                processOf(
                    ...chainedBy(
                        "F",
                        element("StartEvent", "Start"),
                        outer,
                        element("EndEvent", "End"),
                    ),
                ),
            ]),
        );

        expect(idsInFlowOrder(order)).toEqual([
            "Start",
            "F1",
            "Outer",
            "OuterStart",
            "O1",
            "Inner",
            "InnerStart",
            "I1",
            "InnerEnd",
            "O2",
            "OuterEnd",
            "F2",
            "End",
        ]);
    });

    it("walks an event sub-process as one block after its parent's flow", () => {
        const errorStart = element("StartEvent", "ErrorStart");
        const handle = element("Task", "Handle");
        const eventSubProcess = element("SubProcess", "EventSubProcess", {
            triggeredByEvent: true,
            flowElements: [errorStart, handle, sequenceFlow("ToHandle", errorStart, handle)],
        });

        const order = buildFlowOrder(
            definitionsOf(
                [
                    processOf(
                        element("StartEvent", "Start"),
                        element("EndEvent", "End"),
                        sequenceFlow("ToEnd", "Start", "End"),
                        eventSubProcess,
                    ),
                ],
                {
                    Start: { x: 100, y: 100 },
                    End: { x: 300, y: 100 },
                    EventSubProcess: { x: 50, y: 250 },
                    ErrorStart: { x: 100, y: 300 },
                    Handle: { x: 200, y: 300 },
                },
            ),
        );

        expect(idsInFlowOrder(order)).toEqual([
            "Start",
            "ToEnd",
            "End",
            "EventSubProcess",
            "ErrorStart",
            "ToHandle",
            "Handle",
        ]);
    });

    it("walks an embedded sub-process's event sub-processes before its outgoing flow", () => {
        const subProcess = element("SubProcess", "Sub", {
            flowElements: [
                ...chainedBy(
                    "I",
                    element("StartEvent", "InnerStart"),
                    element("EndEvent", "InnerEnd"),
                ),
                element("SubProcess", "LowerEventSubProcess", {
                    triggeredByEvent: true,
                    flowElements: [element("StartEvent", "LowerStart")],
                }),
                element("SubProcess", "UpperEventSubProcess", {
                    triggeredByEvent: true,
                    flowElements: [element("StartEvent", "UpperStart")],
                }),
            ],
        });

        const order = buildFlowOrder(
            definitionsOf(
                [
                    processOf(
                        ...chainedBy(
                            "F",
                            element("StartEvent", "Start"),
                            subProcess,
                            element("EndEvent", "End"),
                        ),
                    ),
                ],
                {
                    UpperEventSubProcess: { x: 300, y: 200 },
                    LowerEventSubProcess: { x: 100, y: 300 },
                },
            ),
        );

        expect(idsInFlowOrder(order)).toEqual([
            "Start",
            "F1",
            "Sub",
            "InnerStart",
            "I1",
            "InnerEnd",
            "UpperEventSubProcess",
            "UpperStart",
            "LowerEventSubProcess",
            "LowerStart",
            "F2",
            "End",
        ]);
    });

    it("enters a sub-process without a start event at its nodes no sequence flow leads to", () => {
        const prepare = element("Task", "Prepare");
        const ship = element("Task", "Ship");
        const adHocSubProcess = element("AdHocSubProcess", "AdHoc", {
            flowElements: [ship, prepare, sequenceFlow("ToShip", prepare, ship)],
        });

        const order = buildFlowOrder(
            definitionsOf(
                [
                    processOf(
                        ...chainedBy(
                            "F",
                            element("StartEvent", "Start"),
                            adHocSubProcess,
                            element("EndEvent", "End"),
                        ),
                    ),
                ],
                {
                    Prepare: { x: 100, y: 200 },
                    Ship: { x: 300, y: 100 },
                },
            ),
        );

        expect(idsInFlowOrder(order)).toEqual([
            "Start",
            "F1",
            "AdHoc",
            "Prepare",
            "ToShip",
            "Ship",
            "F2",
            "End",
        ]);
    });

    it("keeps an unreached sub-process's content right after its shape in the orphan tail", () => {
        const unreached = element("SubProcess", "Unreached", {
            flowElements: chainedBy(
                "I",
                element("StartEvent", "InnerStart"),
                element("EndEvent", "InnerEnd"),
            ),
        });

        const order = buildFlowOrder(
            definitionsOf(
                [processOf(element("StartEvent", "Start"), unreached, element("Task", "Lonely"))],
                {
                    Start: { x: 100, y: 100 },
                    Unreached: { x: 100, y: 200 },
                    InnerStart: { x: 150, y: 300 },
                    I1: [
                        { x: 186, y: 318 },
                        { x: 350, y: 318 },
                    ],
                    Lonely: { x: 600, y: 250 },
                    InnerEnd: { x: 350, y: 300 },
                },
            ),
        );

        expect(idsInFlowOrder(order)).toEqual([
            "Start",
            "Unreached",
            "InnerStart",
            "I1",
            "InnerEnd",
            "Lonely",
        ]);
    });

    it("steps to a boundary event after its host's outgoing flows and walks its exception path", () => {
        const host = element("Task", "A");
        const timer = boundaryEvent("Timer", host);
        const escalate = element("Task", "Escalate");

        const order = buildFlowOrder(
            definitionsOf(
                [
                    processOf(
                        ...chainedBy(
                            "F",
                            element("StartEvent", "Start"),
                            host,
                            element("Task", "B"),
                            element("EndEvent", "End"),
                        ),
                        timer,
                        escalate,
                        sequenceFlow("FT", timer, escalate),
                    ),
                ],
                {
                    Start: { x: 100, y: 100 },
                    A: { x: 200, y: 78 },
                    B: { x: 400, y: 78 },
                    End: { x: 600, y: 100 },
                    Timer: { x: 232, y: 140 },
                    Escalate: { x: 300, y: 220 },
                    FT: [
                        { x: 250, y: 176 },
                        { x: 250, y: 260 },
                        { x: 300, y: 260 },
                    ],
                },
            ),
        );

        expect(idsInFlowOrder(order)).toEqual([
            "Start",
            "F1",
            "A",
            "F2",
            "Timer",
            "FT",
            "B",
            "F3",
            "Escalate",
            "End",
        ]);
    });

    it("steps to several boundary events on one host in reading order", () => {
        const host = element("Task", "A");

        const order = buildFlowOrder(
            definitionsOf(
                [
                    processOf(
                        ...chainedBy(
                            "F",
                            element("StartEvent", "Start"),
                            host,
                            element("EndEvent", "End"),
                        ),
                        boundaryEvent("TimerBottomRight", host),
                        boundaryEvent("ErrorTop", host),
                        boundaryEvent("MessageBottomLeft", host),
                    ),
                ],
                {
                    A: { x: 200, y: 80 },
                    TimerBottomRight: { x: 260, y: 142 },
                    ErrorTop: { x: 220, y: 62 },
                    MessageBottomLeft: { x: 210, y: 142 },
                },
            ),
        );

        expect(idsInFlowOrder(order)).toEqual([
            "Start",
            "F1",
            "A",
            "F2",
            "ErrorTop",
            "MessageBottomLeft",
            "TimerBottomRight",
            "End",
        ]);
    });

    it("steps to a sub-process's boundary event after its content and outgoing flow", () => {
        const subProcess = element("SubProcess", "Sub", {
            flowElements: chainedBy(
                "I",
                element("StartEvent", "InnerStart"),
                element("EndEvent", "InnerEnd"),
            ),
        });
        const cancel = boundaryEvent("Cancel", subProcess);
        const cleanup = element("Task", "Cleanup");

        const order = buildFlowOrder(
            definitionsOf([
                processOf(
                    ...chainedBy(
                        "F",
                        element("StartEvent", "Start"),
                        subProcess,
                        element("EndEvent", "End"),
                    ),
                    cancel,
                    cleanup,
                    sequenceFlow("ToCleanup", cancel, cleanup),
                ),
            ]),
        );

        expect(idsInFlowOrder(order)).toEqual([
            "Start",
            "F1",
            "Sub",
            "InnerStart",
            "I1",
            "InnerEnd",
            "F2",
            "Cancel",
            "ToCleanup",
            "End",
            "Cleanup",
        ]);
    });

    it("does not enter a sub-process without a start event at a boundary event", () => {
        const review = element("Task", "Review");
        const adHocSubProcess = element("AdHocSubProcess", "AdHoc", {
            flowElements: [boundaryEvent("Reminder", review), review],
        });

        const order = buildFlowOrder(
            definitionsOf(
                [
                    processOf(
                        ...chainedBy(
                            "F",
                            element("StartEvent", "Start"),
                            adHocSubProcess,
                            element("EndEvent", "End"),
                        ),
                    ),
                ],
                {
                    Review: { x: 100, y: 200 },
                    Reminder: { x: 130, y: 182 },
                },
            ),
        );

        expect(idsInFlowOrder(order)).toEqual([
            "Start",
            "F1",
            "AdHoc",
            "Review",
            "Reminder",
            "F2",
            "End",
        ]);
    });

    it("walks a process referenced by both a participant and the root elements once", () => {
        const start = element("StartEvent", "Start");
        const end = element("EndEvent", "End");
        const process = processOf(start, end, sequenceFlow("Flow_1", start, end));
        const collaboration = element("Collaboration", "Collaboration_1", {
            participants: [element("Participant", "Participant_1", { processRef: process })],
        });

        const order = buildFlowOrder(definitionsOf([collaboration, process]));

        expect(idsInFlowOrder(order)).toEqual(["Start", "Flow_1", "End"]);
        expect([...order.values()].map((position) => position.flowIndex).sort()).toEqual([0, 1, 2]);
    });

    it("positions shapes by their bounds and flows by their waypoint midpoint", () => {
        const start = element("StartEvent", "Start");
        const end = element("EndEvent", "End");

        const order = buildFlowOrder(
            definitionsOf([processOf(start, end, sequenceFlow("Flow_1", start, end))], {
                Start: { x: 10, y: 20 },
                Flow_1: [
                    { x: 0, y: 0 },
                    { x: 100, y: 50 },
                ],
            }),
        );

        expect(order.get("Start")).toMatchObject({ x: 10, y: 20 });
        expect(order.get("Flow_1")).toMatchObject({ x: 50, y: 25 });
        expect(order.get("End")).toMatchObject({ x: 0, y: 0 });
    });

    it("places a flow without diagram info at its source's position", () => {
        const start = element("StartEvent", "Start");
        const end = element("EndEvent", "End");

        const order = buildFlowOrder(
            definitionsOf([processOf(start, end, sequenceFlow("Flow_1", start, end))], {
                Start: { x: 10, y: 20 },
            }),
        );

        expect(order.get("Flow_1")).toMatchObject({ x: 10, y: 20 });
    });
});

describe("buildRemovedAnchors", () => {
    const before = (...flowElements: ModdleElement[]) =>
        definitionsOf([processOf(...flowElements)]);

    it("returns no anchors when nothing was removed", () => {
        expect(buildRemovedAnchors([], before(element("Task", "Task")), new Map())).toEqual(
            new Map(),
        );
    });

    it("places a removed node just after its surviving predecessor", () => {
        const anchors = buildRemovedAnchors(
            ["Removed"],
            before(
                element("Task", "Before"),
                element("Task", "Removed"),
                sequenceFlow("In", "Before", "Removed"),
            ),
            new Map([["Before", at(3, 40, 50)]]),
        );

        expect(anchors.get("Removed")).toEqual(at(3.5, 40, 50));
    });

    it("places a removed successor of a sub-process after the sub-process's content", () => {
        const afterOrder = buildFlowOrder(
            definitionsOf([
                processOf(
                    ...chainedBy(
                        "F",
                        element("StartEvent", "Start"),
                        element("SubProcess", "Sub", {
                            flowElements: chainedBy(
                                "I",
                                element("StartEvent", "InnerStart"),
                                element("EndEvent", "InnerEnd"),
                            ),
                        }),
                        element("EndEvent", "End"),
                    ),
                ),
            ]),
        );

        const anchors = buildRemovedAnchors(
            ["Removed"],
            before(
                element("SubProcess", "Sub"),
                element("Task", "Removed"),
                sequenceFlow("ToRemoved", "Sub", "Removed"),
            ),
            afterOrder,
        );

        expect(sortIdsByOrder(["F2", "Removed", "InnerEnd", "Sub"], afterOrder, anchors)).toEqual([
            "Sub",
            "InnerEnd",
            "Removed",
            "F2",
        ]);
    });

    it("places a removed node just after its surviving incoming flow when the source is gone", () => {
        const anchors = buildRemovedAnchors(
            ["Removed"],
            before(element("Task", "Removed"), sequenceFlow("In", "GoneSource", "Removed")),
            new Map([["In", at(4)]]),
        );

        expect(anchors.get("Removed")?.flowIndex).toBe(4.25);
    });

    it("places a removed node just before its surviving successor when no predecessor survived", () => {
        const anchors = buildRemovedAnchors(
            ["Removed"],
            before(
                element("Task", "Removed"),
                element("Task", "After"),
                sequenceFlow("Out", "Removed", "After"),
            ),
            new Map([["After", at(6)]]),
        );

        expect(anchors.get("Removed")?.flowIndex).toBe(5.5);
    });

    it("places a removed node just before its surviving outgoing flow when the target is gone", () => {
        const anchors = buildRemovedAnchors(
            ["Removed"],
            before(element("Task", "Removed"), sequenceFlow("Out", "Removed", "GoneTarget")),
            new Map([["Out", at(6)]]),
        );

        expect(anchors.get("Removed")?.flowIndex).toBe(5.75);
    });

    it("anchors a removed sequence flow after its source, or else before its target", () => {
        const graph = before(
            element("Task", "Source"),
            element("Task", "Target"),
            sequenceFlow("RemovedFlow", "Source", "Target"),
        );

        expect(
            buildRemovedAnchors(["RemovedFlow"], graph, new Map([["Source", at(2)]])).get(
                "RemovedFlow",
            )?.flowIndex,
        ).toBe(2.5);
        expect(
            buildRemovedAnchors(["RemovedFlow"], graph, new Map([["Target", at(2)]])).get(
                "RemovedFlow",
            )?.flowIndex,
        ).toBe(1.5);
    });

    it("anchors a removed boundary event on its surviving host, else before its outgoing target", () => {
        const graph = before(
            element("Task", "Host"),
            boundaryEvent("RemovedTimer", "Host"),
            element("Task", "Escalate"),
            sequenceFlow("TimerFlow", "RemovedTimer", "Escalate"),
        );

        expect(
            buildRemovedAnchors(
                ["RemovedTimer"],
                graph,
                new Map([
                    ["Host", at(3, 40, 50)],
                    ["Escalate", at(8)],
                ]),
            ).get("RemovedTimer"),
        ).toEqual(at(3.5, 40, 50));
        expect(
            buildRemovedAnchors(["RemovedTimer"], graph, new Map([["Escalate", at(8)]])).get(
                "RemovedTimer",
            )?.flowIndex,
        ).toBe(7.5);
    });

    it("anchors a removed boundary event on a surviving sub-process after its content", () => {
        const anchors = buildRemovedAnchors(
            ["RemovedTimer"],
            before(element("SubProcess", "Sub"), boundaryEvent("RemovedTimer", "Sub")),
            new Map([["Sub", { ...at(3), blockEndIndex: 6 }]]),
        );

        expect(anchors.get("RemovedTimer")?.flowIndex).toBe(6.5);
    });

    it("leaves out removed ids with no surviving neighbour or no trace in the before graph", () => {
        const anchors = buildRemovedAnchors(
            ["Isolated", "Unknown"],
            before(element("Task", "Isolated")),
            new Map([["Elsewhere", at(0)]]),
        );

        expect(anchors.size).toBe(0);
    });
});

describe("sortIdsByOrder", () => {
    it("sorts by flow index, breaking ties top to bottom, then left to right", () => {
        const primary = new Map([
            ["Third", at(2)],
            ["SecondRight", at(1, 100, 200)],
            ["SecondLeft", at(1, 100, 100)],
            ["SecondTop", at(1, 50, 900)],
            ["First", at(0)],
        ]);

        expect(sortIdsByOrder([...primary.keys()], primary)).toEqual([
            "First",
            "SecondTop",
            "SecondLeft",
            "SecondRight",
            "Third",
        ]);
    });

    it("falls back to the secondary order and sinks unknown ids to the end in input order", () => {
        const primary = new Map([
            ["A", at(0)],
            ["B", at(1)],
        ]);
        const secondary = new Map([["RemovedBetween", at(0.5)]]);

        expect(
            sortIdsByOrder(
                ["Unknown_1", "B", "Unknown_2", "RemovedBetween", "A"],
                primary,
                secondary,
            ),
        ).toEqual(["A", "RemovedBetween", "B", "Unknown_1", "Unknown_2"]);
    });
});
