import { describe, expect, it } from "vitest";

import { findCleanupCandidates, isRedundantBend, planCleanupActions, tidyWaypoints } from "./rules";
import type { ModdleNode } from "./rules";

function definitions(over: Partial<ModdleNode> = {}): ModdleNode {
    return { $type: "bpmn:Definitions", rootElements: [], diagrams: [], ...over };
}

function process(flowElements: ModdleNode[], over: Partial<ModdleNode> = {}): ModdleNode {
    return { $type: "bpmn:Process", id: "Process_1", flowElements, ...over };
}

function plane(planeElement: ModdleNode[], bpmnElement: unknown = { id: "Process_1" }): ModdleNode {
    return {
        $type: "bpmndi:BPMNDiagram",
        id: "Diagram_1",
        plane: { $type: "bpmndi:BPMNPlane", bpmnElement, planeElement },
    };
}

function di(id: string, over: Partial<ModdleNode> = {}): ModdleNode {
    return {
        $type: "bpmndi:BPMNShape",
        id: `${id}_di`,
        bpmnElement: { id },
        bounds: { x: 0, y: 0, width: 100, height: 80 },
        ...over,
    };
}

function kinds(model: ModdleNode) {
    return findCleanupCandidates(model).map((item) => item.kind);
}

describe("findCleanupCandidates — diagram interchange", () => {
    it("flags a shape whose model element is gone", () => {
        const model = definitions({
            rootElements: [process([{ $type: "bpmn:Task", id: "Task_1" }])],
            diagrams: [plane([di("Task_1"), di("Task_deleted")])],
        });

        expect(kinds(model)).toEqual(["orphan-di"]);
    });

    it("flags a second shape for the same element and keeps the first", () => {
        const model = definitions({
            rootElements: [process([{ $type: "bpmn:Task", id: "Task_1" }])],
            diagrams: [plane([di("Task_1"), { ...di("Task_1"), id: "Task_1_di_copy" }])],
        });

        const found = findCleanupCandidates(model);
        expect(found).toHaveLength(1);
        expect(found[0]).toMatchObject({ kind: "duplicate-di", id: "Task_1_di_copy" });
    });

    it("flags a plane left behind by a deleted subprocess", () => {
        const model = definitions({
            rootElements: [process([])],
            diagrams: [plane([], { id: "SubProcess_gone" })],
        });

        expect(kinds(model)).toEqual(["dangling-plane"]);
    });

    it("flags label bounds that carry no size", () => {
        const model = definitions({
            rootElements: [process([{ $type: "bpmn:StartEvent", id: "Event_1" }])],
            diagrams: [
                plane([
                    di("Event_1", {
                        label: { $type: "bpmndi:BPMNLabel", bounds: { width: 0, height: 0 } },
                    }),
                ]),
            ],
        });

        expect(kinds(model)).toEqual(["empty-label-di"]);
    });
});

describe("findCleanupCandidates — waypoints", () => {
    function edgeModel(waypoint: { x: number; y: number }[]): ModdleNode {
        return definitions({
            rootElements: [
                process([
                    { $type: "bpmn:Task", id: "Task_1" },
                    { $type: "bpmn:Task", id: "Task_2" },
                    {
                        $type: "bpmn:SequenceFlow",
                        id: "Flow_1",
                        sourceRef: { id: "Task_1" },
                        targetRef: { id: "Task_2" },
                    },
                ]),
            ],
            diagrams: [
                plane([
                    di("Task_1"),
                    di("Task_2"),
                    {
                        $type: "bpmndi:BPMNEdge",
                        id: "Flow_1_di",
                        bpmnElement: { id: "Flow_1" },
                        waypoint,
                    },
                ]),
            ],
        });
    }

    it("flags a repeated waypoint", () => {
        expect(
            kinds(
                edgeModel([
                    { x: 0, y: 0 },
                    { x: 50, y: 0 },
                    { x: 50, y: 0 },
                    { x: 100, y: 0 },
                ]),
            ),
        ).toEqual(["duplicate-waypoints"]);
    });

    it("flags a bend that lies on the straight line between its neighbours", () => {
        expect(
            kinds(
                edgeModel([
                    { x: 0, y: 0 },
                    { x: 50, y: 0 },
                    { x: 100, y: 0 },
                ]),
            ),
        ).toEqual(["collinear-waypoints"]);
    });

    it("leaves a genuine 180° doubling-back alone", () => {
        // Collinear, but the middle point sits outside its neighbours — the
        // connection runs out and comes straight back. Removing it would
        // silently reroute the flow.
        expect(
            kinds(
                edgeModel([
                    { x: 0, y: 0 },
                    { x: 100, y: 0 },
                    { x: 40, y: 0 },
                ]),
            ),
        ).toEqual([]);
    });

    it("leaves an ordinary orthogonal bend alone", () => {
        expect(
            kinds(
                edgeModel([
                    { x: 0, y: 0 },
                    { x: 50, y: 0 },
                    { x: 50, y: 80 },
                ]),
            ),
        ).toEqual([]);
    });
});

describe("isRedundantBend", () => {
    it("accepts a point between its collinear neighbours", () => {
        expect(isRedundantBend({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 })).toBe(true);
    });

    it("rejects a point outside its collinear neighbours", () => {
        expect(isRedundantBend({ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 10, y: 0 })).toBe(false);
    });

    it("rejects a real corner", () => {
        expect(isRedundantBend({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 })).toBe(false);
    });
});

describe("findCleanupCandidates — semantics", () => {
    it("flags a sequence flow whose target is gone", () => {
        const model = definitions({
            rootElements: [
                process([
                    { $type: "bpmn:Task", id: "Task_1" },
                    {
                        $type: "bpmn:SequenceFlow",
                        id: "Flow_1",
                        sourceRef: { id: "Task_1" },
                        targetRef: { id: "Task_gone" },
                    },
                ]),
            ],
        });

        expect(kinds(model)).toContain("dangling-flow");
    });

    it("flags a lane reference to a node that no longer exists", () => {
        const model = definitions({
            rootElements: [
                process([{ $type: "bpmn:Task", id: "Task_1" }], {
                    laneSets: [
                        {
                            $type: "bpmn:LaneSet",
                            id: "LaneSet_1",
                            lanes: [
                                {
                                    $type: "bpmn:Lane",
                                    id: "Lane_1",
                                    flowNodeRef: [{ id: "Task_1" }, { id: "Task_gone" }],
                                },
                            ],
                        },
                    ],
                }),
            ],
            diagrams: [plane([di("Task_1")])],
        });

        const found = findCleanupCandidates(model);
        expect(found).toHaveLength(1);
        expect(found[0]).toMatchObject({ kind: "stale-flow-node-ref", id: "Lane_1" });
    });

    it("leaves a lane whose references all resolve", () => {
        const model = definitions({
            rootElements: [
                process([{ $type: "bpmn:Task", id: "Task_1" }], {
                    laneSets: [
                        {
                            $type: "bpmn:LaneSet",
                            id: "LaneSet_1",
                            lanes: [
                                {
                                    $type: "bpmn:Lane",
                                    id: "Lane_1",
                                    flowNodeRef: [{ id: "Task_1" }],
                                },
                            ],
                        },
                    ],
                }),
            ],
            diagrams: [plane([di("Task_1")])],
        });

        expect(kinds(model)).toEqual([]);
    });

    it("flags an unconnected task that has no shape", () => {
        const model = definitions({
            rootElements: [process([{ $type: "bpmn:Task", id: "Task_ghost" }])],
        });

        expect(kinds(model)).toEqual(["isolated-node"]);
    });

    it("leaves an unconnected task the user can see", () => {
        const model = definitions({
            rootElements: [process([{ $type: "bpmn:Task", id: "Task_1" }])],
            diagrams: [plane([di("Task_1")])],
        });

        expect(kinds(model)).toEqual([]);
    });

    it("leaves a lone start event alone even without a shape", () => {
        const model = definitions({
            rootElements: [process([{ $type: "bpmn:StartEvent", id: "Event_1" }])],
        });

        expect(kinds(model)).toEqual([]);
    });

    it("leaves a boundary event that is attached to a host", () => {
        const model = definitions({
            rootElements: [
                process([
                    { $type: "bpmn:Task", id: "Task_1" },
                    {
                        $type: "bpmn:BoundaryEvent",
                        id: "Boundary_1",
                        attachedToRef: { id: "Task_1" },
                    },
                ]),
            ],
            diagrams: [plane([di("Task_1")])],
        });

        expect(kinds(model)).toEqual([]);
    });

    it("flags an empty lane set and empty extension elements", () => {
        const model = definitions({
            rootElements: [
                process([], {
                    laneSets: [{ $type: "bpmn:LaneSet", id: "LaneSet_1", lanes: [] }],
                    extensionElements: { $type: "bpmn:ExtensionElements", values: [] },
                }),
            ],
        });

        expect(findCleanupCandidates(model).map((item) => item.label)).toEqual([
            "Empty lane set (LaneSet_1)",
            "Empty extension elements on bpmn:Process (Process_1)",
        ]);
    });

    it("finds nothing in a healthy diagram", () => {
        const model = definitions({
            rootElements: [
                process([
                    { $type: "bpmn:StartEvent", id: "Event_1" },
                    { $type: "bpmn:Task", id: "Task_1" },
                    {
                        $type: "bpmn:SequenceFlow",
                        id: "Flow_1",
                        sourceRef: { id: "Event_1" },
                        targetRef: { id: "Task_1" },
                    },
                ]),
            ],
            diagrams: [
                plane([
                    di("Event_1"),
                    di("Task_1"),
                    {
                        $type: "bpmndi:BPMNEdge",
                        id: "Flow_1_di",
                        bpmnElement: { id: "Flow_1" },
                        waypoint: [
                            { x: 0, y: 0 },
                            { x: 100, y: 0 },
                        ],
                    },
                ]),
            ],
        });

        expect(findCleanupCandidates(model)).toEqual([]);
    });
});

describe("tidyWaypoints", () => {
    it("drops a repeated point", () => {
        expect(
            tidyWaypoints([
                { x: 0, y: 0 },
                { x: 50, y: 0 },
                { x: 50, y: 0 },
                { x: 50, y: 80 },
            ]),
        ).toEqual([
            { x: 0, y: 0 },
            { x: 50, y: 0 },
            { x: 50, y: 80 },
        ]);
    });

    it("drops a bend that lies between its neighbours", () => {
        expect(
            tidyWaypoints([
                { x: 0, y: 0 },
                { x: 50, y: 0 },
                { x: 100, y: 0 },
            ]),
        ).toEqual([
            { x: 0, y: 0 },
            { x: 100, y: 0 },
        ]);
    });

    it("keeps the docking points even when they repeat", () => {
        expect(
            tidyWaypoints([
                { x: 0, y: 0 },
                { x: 0, y: 0 },
            ]),
        ).toEqual([
            { x: 0, y: 0 },
            { x: 0, y: 0 },
        ]);
    });

    it("leaves a clean orthogonal route untouched", () => {
        const route = [
            { x: 0, y: 0 },
            { x: 50, y: 0 },
            { x: 50, y: 80 },
            { x: 120, y: 80 },
        ];
        expect(tidyWaypoints(route)).toEqual(route);
    });
});

describe("planCleanupActions", () => {
    it("routes registry-backed removals through modeling and moddle-only ones through a splice", () => {
        const orphanDi = {
            $type: "bpmndi:BPMNShape",
            id: "Orphan_di",
            bpmnElement: { id: "Task_gone" },
            bounds: { x: 0, y: 0, width: 1, height: 1 },
        };
        const model = definitions({
            rootElements: [
                process([
                    { $type: "bpmn:Task", id: "Task_1" },
                    {
                        $type: "bpmn:SequenceFlow",
                        id: "Flow_1",
                        sourceRef: { id: "Task_1" },
                        targetRef: { id: "Task_gone" },
                    },
                ]),
            ],
            diagrams: [plane([di("Task_1"), orphanDi])],
        });

        const actions = planCleanupActions(model);

        expect(actions).toContainEqual({ kind: "remove-element", id: "Flow_1" });
        const splice = actions.find((action) => action.kind === "splice");
        expect(splice).toMatchObject({ kind: "splice", node: orphanDi });
    });

    it("orders stale lane references highest index first so each splice stays valid", () => {
        const refs = [{ id: "gone_a" }, { id: "Task_1" }, { id: "gone_b" }];
        const model = definitions({
            rootElements: [
                process([{ $type: "bpmn:Task", id: "Task_1" }], {
                    laneSets: [
                        {
                            $type: "bpmn:LaneSet",
                            id: "LaneSet_1",
                            lanes: [{ $type: "bpmn:Lane", id: "Lane_1", flowNodeRef: refs }],
                        },
                    ],
                }),
            ],
            diagrams: [plane([di("Task_1")])],
        });

        const indices = planCleanupActions(model)
            .filter((action) => action.kind === "splice")
            .map((action) => (action as { index: number }).index);

        expect(indices).toEqual([2, 0]);
    });

    it("unsets an empty label rather than splicing its owner away", () => {
        const model = definitions({
            rootElements: [process([{ $type: "bpmn:StartEvent", id: "Event_1" }])],
            diagrams: [
                plane([
                    di("Event_1", {
                        label: { $type: "bpmndi:BPMNLabel", bounds: { width: 0, height: 0 } },
                    }),
                ]),
            ],
        });

        expect(planCleanupActions(model)).toEqual([
            expect.objectContaining({ kind: "unset", property: "label" }),
        ]);
    });

    it("produces exactly one action group per reported finding", () => {
        const model = definitions({
            rootElements: [process([{ $type: "bpmn:Task", id: "Task_ghost" }])],
        });

        expect(findCleanupCandidates(model)).toHaveLength(1);
        expect(planCleanupActions(model)).toEqual([{ kind: "remove-element", id: "Task_ghost" }]);
    });
});
