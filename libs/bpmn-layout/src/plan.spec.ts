import { describe, expect, it } from "vitest";

import { computeLayoutPlan, polylineMidpoint } from "./plan";
import type { DiagramSnapshot, ElementSnapshot, LayoutResult, Point } from "./types";

function shape(id: string, x: number, y: number, over: Partial<ElementSnapshot> = {}) {
    return { id, type: "bpmn:Task", x, y, width: 100, height: 80, ...over };
}

function connection(id: string, waypoints: Point[], over: Partial<ElementSnapshot> = {}) {
    return {
        id,
        type: "bpmn:SequenceFlow",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        waypoints,
        ...over,
    };
}

function result(over: Partial<LayoutResult> = {}): LayoutResult {
    return { shapes: [], edges: [], diagnostics: [], ...over };
}

describe("computeLayoutPlan", () => {
    it("emits nothing when the geometry already matches", () => {
        const snapshot: DiagramSnapshot = [shape("Task_1", 100, 100)];
        const target = result({
            shapes: [{ id: "Task_1", x: 100, y: 100, width: 100, height: 80 }],
        });

        expect(computeLayoutPlan(snapshot, target)).toEqual([]);
    });

    it("treats sub-pixel drift as unchanged", () => {
        const snapshot: DiagramSnapshot = [shape("Task_1", 100, 100)];
        const target = result({
            shapes: [{ id: "Task_1", x: 100.2, y: 99.8, width: 100, height: 80 }],
        });

        expect(computeLayoutPlan(snapshot, target)).toEqual([]);
    });

    it("moves a shape by the delta between snapshot and target", () => {
        const snapshot: DiagramSnapshot = [shape("Task_1", 100, 100)];
        const target = result({
            shapes: [{ id: "Task_1", x: 340, y: 180, width: 100, height: 80 }],
        });

        expect(computeLayoutPlan(snapshot, target)).toEqual([
            { kind: "move", id: "Task_1", delta: { x: 240, y: 80 } },
        ]);
    });

    it("emits a single resize — never resize plus move — when the size changed", () => {
        const snapshot: DiagramSnapshot = [
            shape("Participant_1", 100, 100, { type: "bpmn:Participant", width: 600, height: 250 }),
        ];
        const target = result({
            shapes: [{ id: "Participant_1", x: 160, y: 120, width: 900, height: 400 }],
        });

        expect(computeLayoutPlan(snapshot, target)).toEqual([
            {
                kind: "resize",
                id: "Participant_1",
                bounds: { x: 160, y: 120, width: 900, height: 400 },
            },
        ]);
    });

    it("clamps a degenerate size to the 10px floor ResizeShapeHandler enforces", () => {
        const snapshot: DiagramSnapshot = [shape("Group_1", 0, 0, { type: "bpmn:Group" })];
        const target = result({ shapes: [{ id: "Group_1", x: 0, y: 0, width: 4, height: 0 }] });

        expect(computeLayoutPlan(snapshot, target)).toEqual([
            { kind: "resize", id: "Group_1", bounds: { x: 0, y: 0, width: 10, height: 10 } },
        ]);
    });

    // The double-move regression: MoveShapeHandler would drag children along if
    // the applier ever dropped `recurse: false`, and a plan built from live
    // state instead of the snapshot would then double-apply. Both elements must
    // carry their own absolute-derived delta.
    it("gives a parent and its child each an independent absolute delta", () => {
        const snapshot: DiagramSnapshot = [
            shape("SubProcess_1", 100, 100, {
                type: "bpmn:SubProcess",
                width: 350,
                height: 200,
            }),
            shape("Task_1", 140, 140, { parentId: "SubProcess_1" }),
        ];
        const target = result({
            shapes: [
                { id: "SubProcess_1", x: 200, y: 100, width: 350, height: 200 },
                { id: "Task_1", x: 240, y: 140, width: 100, height: 80 },
            ],
        });

        expect(computeLayoutPlan(snapshot, target)).toEqual([
            { kind: "move", id: "SubProcess_1", delta: { x: 100, y: 0 } },
            { kind: "move", id: "Task_1", delta: { x: 100, y: 0 } },
        ]);
    });

    it("replaces waypoints and orders associations after ordinary connections", () => {
        const snapshot: DiagramSnapshot = [
            connection(
                "Association_1",
                [
                    { x: 0, y: 0 },
                    { x: 10, y: 10 },
                ],
                { type: "bpmn:Association" },
            ),
            connection("Flow_1", [
                { x: 0, y: 0 },
                { x: 20, y: 0 },
            ]),
        ];
        const target = result({
            edges: [
                {
                    id: "Association_1",
                    waypoints: [
                        { x: 5, y: 5 },
                        { x: 40, y: 40 },
                    ],
                },
                {
                    id: "Flow_1",
                    waypoints: [
                        { x: 0, y: 0 },
                        { x: 60, y: 0 },
                    ],
                },
            ],
        });

        expect(computeLayoutPlan(snapshot, target).map((operation) => operation.id)).toEqual([
            "Flow_1",
            "Association_1",
        ]);
    });

    it("leaves untouched connections alone", () => {
        const snapshot: DiagramSnapshot = [
            connection("Flow_1", [
                { x: 0, y: 0 },
                { x: 20, y: 0 },
            ]),
        ];
        const target = result({
            edges: [
                {
                    id: "Flow_1",
                    waypoints: [
                        { x: 0, y: 0 },
                        { x: 20, y: 0 },
                    ],
                },
            ],
        });

        expect(computeLayoutPlan(snapshot, target)).toEqual([]);
    });

    it("carries a shape's label along by the shape's own delta, last in the plan", () => {
        const snapshot: DiagramSnapshot = [
            shape("Event_1", 100, 100, { type: "bpmn:StartEvent", width: 36, height: 36 }),
            shape("Event_1_label", 90, 145, {
                type: "label",
                width: 60,
                height: 14,
                labelTargetId: "Event_1",
            }),
        ];
        const target = result({
            shapes: [{ id: "Event_1", x: 300, y: 100, width: 36, height: 36 }],
        });

        expect(computeLayoutPlan(snapshot, target)).toEqual([
            { kind: "move", id: "Event_1", delta: { x: 200, y: 0 } },
            { kind: "move-label", id: "Event_1_label", delta: { x: 200, y: 0 } },
        ]);
    });

    it("moves a connection's label by how far the polyline midpoint travelled", () => {
        const snapshot: DiagramSnapshot = [
            connection("Flow_1", [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
            ]),
            shape("Flow_1_label", 40, 20, {
                type: "label",
                width: 60,
                height: 14,
                labelTargetId: "Flow_1",
            }),
        ];
        const target = result({
            edges: [
                {
                    id: "Flow_1",
                    waypoints: [
                        { x: 0, y: 0 },
                        { x: 300, y: 0 },
                    ],
                },
            ],
        });

        // Midpoint travels from x=50 to x=150, so the label follows by 100 —
        // preserving the offset the user gave it rather than snapping it.
        expect(computeLayoutPlan(snapshot, target)).toContainEqual({
            kind: "move-label",
            id: "Flow_1_label",
            delta: { x: 100, y: 0 },
        });
    });

    it("ignores target geometry for elements that are not in the snapshot", () => {
        const target = result({
            shapes: [{ id: "Ghost_1", x: 0, y: 0, width: 100, height: 80 }],
            edges: [{ id: "Ghost_Flow", waypoints: [{ x: 0, y: 0 }] }],
        });

        expect(computeLayoutPlan([], target)).toEqual([]);
    });

    // Idempotency, asserted at the level that can actually carry it: applying a
    // plan reproduces the target exactly, so a second run has nothing to do.
    it("is idempotent — applying the plan leaves a second run with no work", () => {
        const snapshot: DiagramSnapshot = [
            shape("Task_1", 100, 100),
            shape("Task_2", 400, 260, { width: 120, height: 90 }),
            connection("Flow_1", [
                { x: 200, y: 140 },
                { x: 400, y: 300 },
            ]),
        ];
        const target = result({
            shapes: [
                { id: "Task_1", x: 160, y: 100, width: 100, height: 80 },
                { id: "Task_2", x: 420, y: 100, width: 100, height: 80 },
            ],
            edges: [
                {
                    id: "Flow_1",
                    waypoints: [
                        { x: 260, y: 140 },
                        { x: 420, y: 140 },
                    ],
                },
            ],
        });

        const plan = computeLayoutPlan(snapshot, target);
        expect(plan.length).toBeGreaterThan(0);

        expect(computeLayoutPlan(apply(snapshot, plan), target)).toEqual([]);
    });
});

describe("polylineMidpoint", () => {
    it("splits a straight line in half", () => {
        expect(
            polylineMidpoint([
                { x: 0, y: 0 },
                { x: 100, y: 0 },
            ]),
        ).toEqual({ x: 50, y: 0 });
    });

    it("measures by accumulated length across segments", () => {
        expect(
            polylineMidpoint([
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 100, y: 100 },
            ]),
        ).toEqual({ x: 100, y: 0 });
    });

    it("survives degenerate input", () => {
        expect(polylineMidpoint([])).toEqual({ x: 0, y: 0 });
        expect(polylineMidpoint([{ x: 7, y: 9 }])).toEqual({ x: 7, y: 9 });
        expect(
            polylineMidpoint([
                { x: 7, y: 9 },
                { x: 7, y: 9 },
            ]),
        ).toEqual({ x: 7, y: 9 });
    });
});

/** Test-only executor: applies a plan to a snapshot the way the applier would. */
function apply(snapshot: DiagramSnapshot, plan: ReturnType<typeof computeLayoutPlan>) {
    const next = snapshot.map((element) => ({
        ...element,
        waypoints: element.waypoints?.map((point) => ({ ...point })),
    }));
    const byId = new Map(next.map((element) => [element.id, element]));

    for (const operation of plan) {
        const element = byId.get(operation.id);
        if (!element) continue;
        switch (operation.kind) {
            case "move":
            case "move-label":
                element.x += operation.delta.x;
                element.y += operation.delta.y;
                break;
            case "resize":
                Object.assign(element, operation.bounds);
                break;
            case "waypoints":
                element.waypoints = operation.waypoints.map((point) => ({ ...point }));
                break;
        }
    }
    return next;
}
