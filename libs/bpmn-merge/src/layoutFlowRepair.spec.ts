import { describe, expect, it } from "vitest";

import { at, flow as buildFlow, layoutOf, node as buildNode } from "./__fixtures__/layoutShapes";
import { subProcessPlane } from "./__fixtures__/shapePlane";
import { type FlowRepair, planFlowRepairs } from "./layoutFlowRepair";
import { type DiagramBounds, type Outline, type Point, centerOf } from "./layoutGeometry";
import type { LayoutModel, NodeShape } from "./layoutModel";
import { distanceToPolyline } from "./layoutPolyline";
import { detectLayoutSpots } from "./layoutSpotDetection";
import type { LayoutSpot } from "./layoutSpots";

const node = (
    id: string,
    bounds: DiagramBounds,
    outline: Outline = "rectangle",
    relations: Partial<NodeShape> = {},
) => buildNode(id, { bounds, outline, ...relations });

const flow = (waypoints: readonly Point[], label?: DiagramBounds) =>
    buildFlow("Flow_1", "Task_A", "Task_B", waypoints, label === undefined ? {} : { label });

const TASK_A = node("Task_A", { x: 100, y: 100, width: 100, height: 80 });

/** The layout with every repair written back, as the build writes it. */
function repaired(layout: LayoutModel, repairs: readonly FlowRepair[]): LayoutModel {
    const edges = new Map(layout.edges);
    for (const repair of repairs) {
        const edge = edges.get(repair.flow)!;
        if (repair.kind === "movedByBuild") {
            edges.set(repair.flow, { ...edge, waypoints: repair.waypoints });
        }
    }
    return { shapes: layout.shapes, edges };
}

function repairsOf(layout: LayoutModel): FlowRepair[] {
    return planFlowRepairs(layout, detectLayoutSpots(layout));
}

describe("planFlowRepairs", () => {
    it("re-docks an end its shape moved away from and keeps the flow's own bend", () => {
        const layout = layoutOf(
            [TASK_A, node("Task_B", { x: 300, y: 300, width: 100, height: 80 })],
            [flow([at(200, 140), at(350, 140), at(350, 250)])],
        );

        expect(repairsOf(layout)).toEqual([
            {
                kind: "movedByBuild",
                flow: "Flow_1",
                waypoints: [at(200, 140), at(350, 140), at(350, 300)],
            },
        ]);
    });

    it("re-docks an end that lies deep inside its shape on the outline", () => {
        const layout = layoutOf(
            [TASK_A, node("Task_B", { x: 300, y: 200, width: 100, height: 80 })],
            [flow([at(200, 140), at(350, 140), at(350, 250)])],
        );

        expect(repairsOf(layout)).toEqual([
            {
                kind: "movedByBuild",
                flow: "Flow_1",
                waypoints: [at(200, 140), at(350, 140), at(350, 200)],
            },
        ]);
    });

    it.each<{ outline: Outline; bounds: DiagramBounds }>([
        { outline: "circle", bounds: { x: 332, y: 300, width: 36, height: 36 } },
        { outline: "diamond", bounds: { x: 325, y: 300, width: 50, height: 50 } },
    ])("re-docks an end on a $outline's outline", ({ outline, bounds }) => {
        const layout = layoutOf(
            [TASK_A, node("Task_B", bounds, outline)],
            [flow([at(200, 140), at(350, 140), at(350, 250)])],
        );

        expect(repairsOf(layout)).toEqual([
            {
                kind: "movedByBuild",
                flow: "Flow_1",
                waypoints: [at(200, 140), at(350, 140), at(350, 300)],
            },
        ]);
    });

    it("re-routes a flow around a shape it runs through, and its label follows it", () => {
        const label = { x: 280, y: 145, width: 20, height: 14 };
        const before = [at(200, 140), at(400, 140)];
        const layout = layoutOf(
            [
                TASK_A,
                node("Task_B", { x: 400, y: 100, width: 100, height: 80 }),
                node("Task_C", { x: 260, y: 110, width: 60, height: 60 }),
            ],
            [flow(before, label)],
        );

        const repairs = repairsOf(layout);

        expect(repairs).toHaveLength(1);
        const [repair] = repairs;
        expect(repair?.kind).toBe("movedByBuild");
        expect(detectLayoutSpots(repaired(layout, repairs))).toEqual([]);
        if (repair?.kind !== "movedByBuild") return;
        expect(repair.label).not.toEqual(label);
        expect(distanceToPolyline(repair.waypoints, centerOf(repair.label!))).toBeCloseTo(
            distanceToPolyline(before, centerOf(label)),
            0,
        );
    });

    it("leaves a flow's label where it is when the segment beside it stays", () => {
        const label = { x: 355, y: 180, width: 20, height: 14 };
        const layout = layoutOf(
            [TASK_A, node("Task_B", { x: 300, y: 300, width: 100, height: 80 })],
            [flow([at(200, 140), at(350, 140), at(350, 250)], label)],
        );

        expect(repairsOf(layout)).toEqual([
            expect.objectContaining({ kind: "movedByBuild", label }),
        ]);
    });

    it("does not route a boundary event's flow through the event's host", () => {
        const host = node("Task_Host", { x: 100, y: 100, width: 100, height: 80 });
        const boundary = node("Boundary_1", { x: 132, y: 162, width: 36, height: 36 }, "circle", {
            host: "Task_Host",
        });
        const target = node("Task_B", { x: 120, y: 300, width: 100, height: 80 });
        const layout = layoutOf(
            [host, boundary, target],
            [buildFlow("Flow_1", "Boundary_1", "Task_B", [at(150, 198), at(150, 260)])],
        );

        const [repair] = repairsOf(layout);

        expect(repair?.kind).toBe("movedByBuild");
        if (repair?.kind !== "movedByBuild") return;
        expect(Math.min(...repair.waypoints.map(({ y }) => y))).toBeGreaterThanOrEqual(180);
    });

    it("re-docks an end on the side of its shape's center that its next bend lies on", () => {
        const layout = layoutOf(
            [TASK_A, node("Task_B", { x: 60, y: 250, width: 100, height: 80 })],
            [flow([at(40, 140), at(103, 140), at(103, 250)])],
        );

        expect(repairsOf(layout)).toEqual([
            {
                kind: "movedByBuild",
                flow: "Flow_1",
                waypoints: [at(100, 140), at(103, 140), at(103, 250)],
            },
        ]);
    });

    it("does not keep a straight flow that would run through its own small end", () => {
        const layout = layoutOf(
            [
                node("Task_A", { x: 300, y: 140, width: 36, height: 36 }, "circle"),
                node("Task_B", { x: 150, y: 118, width: 100, height: 80 }),
            ],
            [flow([at(336, 158), at(400, 158)])],
        );

        expect(repairsOf(layout)).toEqual([
            { kind: "movedByBuild", flow: "Flow_1", waypoints: [at(300, 158), at(250, 158)] },
        ]);
    });

    it("keeps a re-routed flow inside the expanded sub-process both its ends lie in", () => {
        const inSubProcess = { subProcesses: ["Sub_1"] };
        const layout = layoutOf(
            [
                node("Sub_1", { x: 0, y: 0, width: 600, height: 200 }, "rectangle", {
                    expanded: true,
                }),
                node("Task_A", { x: 50, y: 60, width: 100, height: 80 }, "rectangle", inSubProcess),
                node(
                    "Task_B",
                    { x: 450, y: 60, width: 100, height: 80 },
                    "rectangle",
                    inSubProcess,
                ),
                node(
                    "Task_C",
                    { x: 250, y: 10, width: 100, height: 180 },
                    "rectangle",
                    inSubProcess,
                ),
            ],
            [flow([at(150, 100), at(450, 100)])],
        );

        const [repair] = repairsOf(layout);

        expect(repair?.kind).toBe("movedByBuild");
        if (repair?.kind !== "movedByBuild") return;
        for (const { y } of repair.waypoints) {
            expect(y).toBeGreaterThanOrEqual(0);
            expect(y).toBeLessThanOrEqual(200);
        }
    });

    it("keeps the flow's own bends when they cost at most the allowance more than a fresh route", () => {
        const layout = layoutOf(
            [TASK_A, node("Task_B", { x: 300, y: 300, width: 100, height: 80 })],
            [flow([at(150, 180), at(150, 240), at(350, 240), at(350, 280)])],
        );

        expect(repairsOf(layout)).toEqual([
            {
                kind: "movedByBuild",
                flow: "Flow_1",
                waypoints: [at(150, 180), at(150, 240), at(350, 240), at(350, 300)],
            },
        ]);
    });

    it("takes a fresh route when the flow's own bends cost more than the allowance over it", () => {
        const layout = layoutOf(
            [TASK_A, node("Task_B", { x: 300, y: 100, width: 100, height: 80 })],
            [flow([at(200, 140), at(250, 140), at(250, 400), at(350, 400), at(350, 280)])],
        );

        expect(repairsOf(layout)).toEqual([
            { kind: "movedByBuild", flow: "Flow_1", waypoints: [at(200, 140), at(300, 140)] },
        ]);
    });

    const WALLED_IN_TASK_B = [
        node("Task_B", { x: 400, y: 100, width: 100, height: 80 }),
        node("Wall_Top", { x: 380, y: 60, width: 140, height: 30 }),
        node("Wall_Bottom", { x: 380, y: 190, width: 140, height: 30 }),
        node("Wall_Left_Above_Gap", { x: 360, y: 60, width: 30, height: 76 }),
        node("Wall_Left_Below_Gap", { x: 360, y: 140, width: 30, height: 80 }),
        node("Wall_Right", { x: 510, y: 60, width: 30, height: 160 }),
    ];

    it("keeps the flow's own bends through a gap too narrow for a fresh route", () => {
        const layout = layoutOf(
            [TASK_A, ...WALLED_IN_TASK_B],
            [flow([at(200, 140), at(300, 140), at(300, 138), at(395, 138)])],
        );

        expect(repairsOf(layout)).toEqual([
            {
                kind: "movedByBuild",
                flow: "Flow_1",
                waypoints: [at(200, 140), at(300, 140), at(300, 138), at(400, 138)],
            },
        ]);
    });

    it("keeps the turning point of the flow's own bends that double back", () => {
        const layout = layoutOf(
            [TASK_A, ...WALLED_IN_TASK_B],
            [flow([at(200, 140), at(320, 140), at(300, 140), at(300, 138), at(395, 138)])],
        );

        expect(repairsOf(layout)).toEqual([
            {
                kind: "movedByBuild",
                flow: "Flow_1",
                waypoints: [at(200, 140), at(320, 140), at(300, 140), at(300, 138), at(400, 138)],
            },
        ]);
    });

    it("routes a later flow clear of the route an earlier flow was just repaired onto", () => {
        const throughBlocker = [at(200, 140), at(400, 140)];
        const layout = layoutOf(
            [
                TASK_A,
                node("Task_B", { x: 400, y: 100, width: 100, height: 80 }),
                node("Blocker", { x: 260, y: 110, width: 80, height: 60 }),
            ],
            [flow(throughBlocker), { ...flow(throughBlocker), id: "Flow_2" }],
        );

        expect(repairsOf(layout)).toEqual([
            {
                kind: "movedByBuild",
                flow: "Flow_1",
                waypoints: [at(150, 100), at(150, 85), at(450, 85), at(450, 100)],
            },
            {
                kind: "movedByBuild",
                flow: "Flow_2",
                waypoints: [at(150, 180), at(150, 195), at(450, 195), at(450, 180)],
            },
        ]);
    });

    it("re-routes only the flows its spots name, in their order", () => {
        const layout = layoutOf(
            [TASK_A, node("Task_B", { x: 300, y: 300, width: 100, height: 80 })],
            [
                flow([at(200, 140), at(350, 140), at(350, 250)]),
                { ...flow([at(200, 140), at(350, 140), at(350, 250)]), id: "Flow_2" },
            ],
        );
        const spots: LayoutSpot[] = [
            {
                kind: "flowEndOffShape",
                flow: "Flow_2",
                end: "Task_B",
                at: "target",
                lies: "outside",
            },
        ];

        expect(planFlowRepairs(layout, spots).map(({ flow: id }) => id)).toEqual(["Flow_2"]);
    });

    it("cannot repair a flow into a shape walled in by others", () => {
        const layout = layoutOf(
            [
                TASK_A,
                node("Task_B", { x: 400, y: 100, width: 100, height: 80 }),
                node("Wall_Top", { x: 380, y: 60, width: 140, height: 30 }),
                node("Wall_Bottom", { x: 380, y: 190, width: 140, height: 30 }),
                node("Wall_Left", { x: 360, y: 60, width: 30, height: 160 }),
                node("Wall_Right", { x: 510, y: 60, width: 30, height: 160 }),
            ],
            [flow([at(200, 140), at(300, 140)])],
        );

        expect(repairsOf(layout)).toEqual([{ kind: "notRepaired", flow: "Flow_1" }]);
    });

    it("cannot repair a flow whose end is drawn on another plane", () => {
        const layout = layoutOf(
            [
                TASK_A,
                node("Task_B", { x: 300, y: 300, width: 100, height: 80 }, "rectangle", {
                    ...subProcessPlane("Sub_1"),
                }),
            ],
            [flow([at(200, 140), at(350, 140), at(350, 250)])],
        );
        const spots: LayoutSpot[] = [{ kind: "flowThroughShape", flow: "Flow_1", shape: "Task_C" }];

        expect(planFlowRepairs(layout, spots)).toEqual([{ kind: "notRepaired", flow: "Flow_1" }]);
    });
});
