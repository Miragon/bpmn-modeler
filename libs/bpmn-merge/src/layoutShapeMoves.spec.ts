import { describe, expect, it } from "vitest";

import type { DiagramBounds, Point } from "./layoutGeometry";
import type { LaneShape, LayoutEdge, LayoutModel, LayoutShape, NodeShape } from "./layoutModel";
import { type ShapeMovePlan, planShapeMoves } from "./layoutShapeMoves";
import { detectLayoutSpots } from "./layoutSpotDetection";
import type { LayoutSpot } from "./layoutSpots";

const PLANE = "Collaboration_1";

const box = (x: number, y: number, width = 100, height = 80): DiagramBounds => ({
    x,
    y,
    width,
    height,
});

function node(id: string, bounds: DiagramBounds, relations: Partial<NodeShape> = {}): NodeShape {
    return {
        kind: "node",
        id,
        plane: PLANE,
        bounds,
        outline: "rectangle",
        expanded: false,
        subProcesses: [],
        pool: "Pool_1",
        lanes: ["Lane_1"],
        mayLieOutsidePool: false,
        ...relations,
    };
}

const POOL: LayoutShape = {
    kind: "pool",
    id: "Pool_1",
    plane: PLANE,
    outline: "rectangle",
    bounds: box(0, 0, 1200, 300),
};

/** A lane of the pool's full width, `y` to `y + height`. */
function lane(y: number, height: number, width = 1170): LaneShape {
    return {
        kind: "lane",
        id: "Lane_1",
        plane: PLANE,
        outline: "rectangle",
        parent: "Process_1",
        pool: "Pool_1",
        bounds: box(30, y, width, height),
    };
}

const at = (x: number, y: number): Point => ({ x, y });

function flow(id: string, source: string, target: string, waypoints: readonly Point[]): LayoutEdge {
    return { id, plane: PLANE, source, target, waypoints };
}

function layoutOf(
    shapes: readonly LayoutShape[],
    edges: readonly LayoutEdge[] = [],
    frames: readonly LayoutShape[] = [POOL, lane(0, 300)],
): LayoutModel {
    return {
        shapes: new Map([...frames, ...shapes].map((shape) => [shape.id, shape])),
        edges: new Map(edges.map((edge) => [edge.id, edge])),
    };
}

const overlapsOf = (layout: LayoutModel): LayoutSpot[] =>
    detectLayoutSpots(layout).filter(({ kind }) => kind === "shapesOverlap");

const boundsIn = (plan: ShapeMovePlan, id: string) => plan.layout.shapes.get(id)?.bounds;

const TASK_X = node("Task_X", box(300, 110));

describe("planShapeMoves", () => {
    it("moves a shape the other side drew elsewhere back to that place when it is free", () => {
        const result = layoutOf([TASK_X, node("Task_R", box(310, 110))]);
        const incoming = layoutOf([TASK_X, node("Task_R", box(560, 110))]);

        const plan = planShapeMoves(result, overlapsOf(result), [result, incoming]);

        expect(plan.repairs).toEqual([
            { kind: "movedByBuild", shapes: ["Task_X", "Task_R"], moved: "Task_R" },
        ]);
        expect(boundsIn(plan, "Task_R")).toEqual(box(560, 110));
        expect(boundsIn(plan, "Task_X")).toEqual(TASK_X.bounds);
    });

    it("moves the shape to the nearest free place in its lane when the other side's place is taken", () => {
        const frames = [POOL, lane(70, 160)];
        const result = layoutOf([TASK_X, node("Task_Y", box(310, 110))], [], frames);
        const current = layoutOf([TASK_X], [], frames);

        const plan = planShapeMoves(result, overlapsOf(result), [current, current]);

        expect(plan.repairs).toEqual([
            { kind: "movedByBuild", shapes: ["Task_X", "Task_Y"], moved: "Task_Y" },
        ]);
        expect(boundsIn(plan, "Task_Y")).toEqual(box(420, 110));
    });

    it("keeps a shape drawn outside its sub-process inside the lane it lies in", () => {
        const frames = [POOL, lane(70, 160)];
        const sub = node("Sub_1", box(700, 80, 200, 120), { expanded: true });
        const outsideSub = node("Task_Y", box(310, 110), { subProcesses: ["Sub_1"] });
        const result = layoutOf([TASK_X, sub, outsideSub], [], frames);
        const current = layoutOf([TASK_X, sub], [], frames);

        const plan = planShapeMoves(result, overlapsOf(result), [current, current]);

        expect(boundsIn(plan, "Task_Y")).toEqual(box(420, 110));
    });

    it("keeps the contents of a moved sub-process inside the lanes they lie in", () => {
        const tallPool = { ...POOL, bounds: box(0, 0, 1200, 600) };
        const frames = [tallPool, lane(70, 160)];
        const sub = node("Sub_1", box(320, 150, 200, 140), { expanded: true });
        const child = node("Task_In", box(360, 160, 80, 60), { subProcesses: ["Sub_1"] });
        const above = node("Task_O", box(300, 100, 100, 70));
        const result = layoutOf([above, sub, child], [], frames);
        const current = layoutOf([above], [], frames);

        const plan = planShapeMoves(result, overlapsOf(result), [current, current]);

        expect(boundsIn(plan, "Sub_1")).toEqual(box(420, 150, 200, 140));
        expect(boundsIn(plan, "Task_In")).toEqual(box(460, 160, 80, 60));
    });

    it("keeps clear of a flow that is not the moved shape's own", () => {
        const frames = [POOL, lane(70, 160)];
        const other = flow("Flow_Other", "Task_A", "Task_B", [at(470, 70), at(470, 230)]);
        const shapes = [
            TASK_X,
            node("Task_Y", box(310, 110)),
            node("Task_A", box(420, -100)),
            node("Task_B", box(420, 330)),
        ];
        const result = layoutOf(shapes, [other], frames);
        const current = layoutOf([TASK_X], [], frames);

        const plan = planShapeMoves(result, overlapsOf(result), [current, current]);

        expect(boundsIn(plan, "Task_Y")).toEqual(box(180, 110));
    });

    it("carries a sub-process's contents, boundary events, label and inner flows with it, naming the content it moved off a shape", () => {
        const sub = node("Sub_1", box(320, 60, 300, 180), { expanded: true });
        const inner = { subProcesses: ["Sub_1"] };
        const child = node("Task_In", box(350, 100), inner);
        const end = node("End_In", box(520, 122, 36, 36), {
            ...inner,
            outline: "circle",
            label: box(510, 165, 56, 14),
        });
        const timer = node("Timer_1", box(602, 200, 36, 36), { host: "Sub_1", outline: "circle" });
        const innerFlow = flow("Flow_In", "Task_In", "End_In", [at(450, 140), at(520, 140)]);
        const shapes = [TASK_X, sub, child, end, timer];
        const result = layoutOf(shapes, [innerFlow]);
        const current = layoutOf([TASK_X]);

        const plan = planShapeMoves(result, overlapsOf(result), [current, current]);

        expect(plan.repairs).toEqual([
            { kind: "movedByBuild", shapes: ["Task_X", "Sub_1"], moved: "Sub_1" },
            { kind: "movedByBuild", shapes: ["Task_X", "Task_In"], moved: "Task_In" },
        ]);
        const dx = boundsIn(plan, "Sub_1")!.x - sub.bounds.x;
        const dy = boundsIn(plan, "Sub_1")!.y - sub.bounds.y;
        expect(dx !== 0 || dy !== 0).toBe(true);
        for (const shape of [child, end, timer]) {
            expect(boundsIn(plan, shape.id)).toEqual({
                ...shape.bounds,
                x: shape.bounds.x + dx,
                y: shape.bounds.y + dy,
            });
        }
        const movedEnd = plan.layout.shapes.get("End_In") as NodeShape;
        expect(movedEnd.label).toEqual(box(510 + dx, 165 + dy, 56, 14));
        expect(plan.layout.edges.get("Flow_In")?.waypoints).toEqual([
            at(450 + dx, 140 + dy),
            at(520 + dx, 140 + dy),
        ]);
        expect(overlapsOf(plan.layout)).toEqual([]);
    });

    it("moves the shape the build placed, never a boundary event or a shape both sides draw there", () => {
        const host = node("Task_Host", box(300, 110));
        const timer = node("Timer_1", box(382, 172, 36, 36), {
            host: "Task_Host",
            outline: "circle",
        });
        const result = layoutOf([host, timer, node("Task_Y", box(405, 180))]);
        const current = layoutOf([host, timer]);

        const plan = planShapeMoves(result, overlapsOf(result), [current, current]);

        expect(plan.repairs).toEqual([
            { kind: "movedByBuild", shapes: ["Timer_1", "Task_Y"], moved: "Task_Y" },
        ]);
        expect(boundsIn(plan, "Timer_1")).toEqual(timer.bounds);
    });

    it("names one move for every overlap it resolves", () => {
        const frames = [POOL, lane(70, 160)];
        const result = layoutOf(
            [TASK_X, node("Task_Z", box(430, 110)), node("Task_Y", box(370, 110))],
            [],
            frames,
        );
        const current = layoutOf([TASK_X, node("Task_Z", box(430, 110))], [], frames);

        const plan = planShapeMoves(result, overlapsOf(result), [current, current]);

        expect(plan.repairs).toEqual([
            { kind: "movedByBuild", shapes: ["Task_X", "Task_Y"], moved: "Task_Y" },
            { kind: "movedByBuild", shapes: ["Task_Z", "Task_Y"], moved: "Task_Y" },
        ]);
        expect(overlapsOf(plan.layout)).toEqual([]);
    });

    describe("without a free place nearby", () => {
        const frames = [POOL, lane(70, 120)];
        /** Eight tasks 20 px apart along the lane, each flow docked between two of them. */
        const row = Array.from({ length: 8 }, (_, index) =>
            node(`Task_${index}`, box(100 + index * 120, 90)),
        );
        const rowFlows = row
            .slice(1)
            .map((task, index) =>
                flow(`Flow_${index}`, row[index]!.id, task.id, [
                    at(200 + index * 120, 130),
                    at(220 + index * 120, 130),
                ]),
            );

        it("makes room beyond the other shape, grows the pool and lane, and lists what it shifted", () => {
            const result = layoutOf([...row, node("Task_Y", box(470, 90))], rowFlows, frames);
            const current = layoutOf(row, rowFlows, frames);

            const plan = planShapeMoves(result, overlapsOf(result), [current, current]);

            expect(plan.repairs).toEqual([
                {
                    kind: "madeRoom",
                    shapes: ["Task_3", "Task_Y"],
                    moved: "Task_Y",
                    shifted: ["Task_4", "Task_5", "Task_6", "Task_7"],
                    grown: ["Pool_1", "Lane_1"],
                },
            ]);
            expect(boundsIn(plan, "Task_Y")).toEqual(box(610, 90));
            expect(boundsIn(plan, "Task_4")).toEqual(box(760, 90));
            expect(boundsIn(plan, "Task_3")).toEqual(row[3]!.bounds);
            expect(boundsIn(plan, "Pool_1")).toEqual(box(0, 0, 1380, 300));
            expect(boundsIn(plan, "Lane_1")).toEqual(box(30, 70, 1350, 120));
            expect(plan.layout.edges.get("Flow_3")?.waypoints).toEqual([
                at(560, 130),
                at(760, 130),
            ]);
            expect(plan.layout.edges.get("Flow_4")?.waypoints).toEqual([
                at(860, 130),
                at(880, 130),
            ]);
            expect(overlapsOf(plan.layout)).toEqual([]);
        });

        it("shifts a shape the moved one would land on that starts before the other shape ends", () => {
            const wide = node("Data_1", box(490, 175, 130, 40));
            const result = layoutOf([...row, wide, node("Task_Y", box(470, 90))], rowFlows, frames);
            const current = layoutOf([...row, wide], rowFlows, frames);

            const plan = planShapeMoves(result, overlapsOf(result), [current, current]);

            expect(plan.repairs).toEqual([
                {
                    kind: "madeRoom",
                    shapes: ["Task_3", "Task_Y"],
                    moved: "Task_Y",
                    shifted: ["Task_4", "Task_5", "Task_6", "Task_7", "Data_1"],
                    grown: ["Pool_1", "Lane_1"],
                },
            ]);
            expect(boundsIn(plan, "Task_Y")).toEqual(box(610, 90));
            expect(boundsIn(plan, "Data_1")).toEqual(box(760, 175, 130, 40));
            expect(boundsIn(plan, "Task_3")).toEqual(row[3]!.bounds);
        });

        it("moves the shape without shifting anything when what lies past it is far enough away", () => {
            const [first, far] = [node("Task_0", box(100, 90)), node("Task_1", box(500, 90))];
            const along = flow("Flow_0", "Task_0", "Task_1", [at(200, 130), at(500, 130)]);
            const result = layoutOf([first, far, node("Task_Y", box(110, 90))], [along], frames);
            const current = layoutOf([first, far], [along], frames);

            const plan = planShapeMoves(result, overlapsOf(result), [current, current]);

            expect(plan.repairs).toEqual([
                { kind: "movedByBuild", shapes: ["Task_0", "Task_Y"], moved: "Task_Y" },
            ]);
            expect(boundsIn(plan, "Task_Y")).toEqual(box(250, 90));
            expect(plan.layout.shapes.get("Task_1")).toBe(far);
            expect(plan.layout.shapes.get("Lane_1")).toBe(frames[1]);
        });

        it("grows the pool and lane to hold the moved shape when nothing lies past the line", () => {
            const narrow = [{ ...POOL, bounds: box(0, 0, 650, 300) }, lane(70, 120, 620)];
            const short = row.slice(0, 4);
            const result = layoutOf(
                [...short, node("Task_Y", box(470, 90))],
                rowFlows.slice(0, 3),
                narrow,
            );
            const current = layoutOf(short, rowFlows.slice(0, 3), narrow);

            const plan = planShapeMoves(result, overlapsOf(result), [current, current]);

            expect(plan.repairs).toEqual([
                {
                    kind: "madeRoom",
                    shapes: ["Task_3", "Task_Y"],
                    moved: "Task_Y",
                    shifted: [],
                    grown: ["Pool_1", "Lane_1"],
                },
            ]);
            expect(boundsIn(plan, "Task_Y")).toEqual(box(610, 90));
            expect(boundsIn(plan, "Pool_1")).toEqual(box(0, 0, 720, 300));
            expect(boundsIn(plan, "Lane_1")).toEqual(box(30, 70, 690, 120));
        });

        it("names the shape a room shifted off another as the one the build moved", () => {
            const tallPool = { ...POOL, bounds: box(0, 0, 1200, 400) };
            const lowerLane: LaneShape = { ...lane(190, 200), id: "Lane_2" };
            const inLowerLane = { lanes: ["Lane_2"] };
            const shifted = node("Task_C", box(560, 250), inLowerLane);
            const staying = node("Task_D", box(470, 260), inLowerLane);
            const twoLanes = [tallPool, lane(70, 120), lowerLane];
            const result = layoutOf(
                [...row, node("Task_Y", box(470, 90)), shifted, staying],
                rowFlows,
                twoLanes,
            );
            const current = layoutOf(row, rowFlows, twoLanes);
            const spots: LayoutSpot[] = [
                { kind: "shapesOverlap", shapes: ["Task_3", "Task_Y"] },
                { kind: "shapesOverlap", shapes: ["Task_C", "Task_D"] },
            ];

            const plan = planShapeMoves(result, spots, [current, current]);

            expect(plan.repairs[0]).toMatchObject({ kind: "madeRoom", moved: "Task_Y" });
            expect(plan.repairs[1]).toEqual({
                kind: "movedByBuild",
                shapes: ["Task_C", "Task_D"],
                moved: "Task_C",
            });
        });

        it("names a boundary event that moved with its host off another shape as the one moved", () => {
            const host = node("Task_A", box(470, 90));
            const timer = node("Timer_1", box(552, 152, 36, 36), {
                host: "Task_A",
                outline: "circle",
            });
            const result = layoutOf([...row, host, timer], rowFlows, frames);
            const current = layoutOf(row, rowFlows, frames);
            const spots: LayoutSpot[] = [
                { kind: "shapesOverlap", shapes: ["Task_3", "Task_A"] },
                { kind: "shapesOverlap", shapes: ["Task_4", "Timer_1"] },
            ];

            const plan = planShapeMoves(result, spots, [current, current]);

            expect(plan.repairs[0]).toMatchObject({ moved: "Task_A" });
            expect(plan.repairs[1]).toMatchObject({
                kind: "movedByBuild",
                shapes: ["Task_4", "Timer_1"],
                moved: "Timer_1",
            });
        });

        it("makes no room that widens the pool over the pool beside it", () => {
            const beside: LayoutShape = { ...POOL, id: "Pool_2", bounds: box(1262, 0, 600, 300) };
            const result = layoutOf([...row, node("Task_Y", box(470, 90))], rowFlows, [
                ...frames,
                beside,
            ]);
            const current = layoutOf(row, rowFlows, [...frames, beside]);

            const plan = planShapeMoves(result, overlapsOf(result), [current, current]);

            expect(plan.repairs).toEqual([{ kind: "notRepaired", shapes: ["Task_3", "Task_Y"] }]);
            expect(plan.layout).toBe(result);
        });

        it("leaves the overlap when making room would move the shape out of its sub-process", () => {
            const sub = node("Sub_1", box(380, 75, 140, 110), { expanded: true });
            const other = node("Task_O", box(450, 90));
            const result = layoutOf(
                [sub, other, node("Task_Y", box(400, 90), { subProcesses: ["Sub_1"] })],
                [],
                frames,
            );
            const current = layoutOf([sub, other], [], frames);
            const spot: LayoutSpot = { kind: "shapesOverlap", shapes: ["Task_O", "Task_Y"] };

            const plan = planShapeMoves(result, [spot], [current, current]);

            expect(plan.repairs).toEqual([{ kind: "notRepaired", shapes: ["Task_O", "Task_Y"] }]);
            expect(plan.layout).toBe(result);
        });
    });

    it("leaves an overlap of two shapes both sides draw where the result does", () => {
        const result = layoutOf([TASK_X, node("Task_Y", box(310, 110))]);
        const spot: LayoutSpot = { kind: "shapesOverlap", shapes: ["Task_X", "Task_Y"] };

        const plan = planShapeMoves(result, [spot], [result, result]);

        expect(plan.repairs).toEqual([{ kind: "notRepaired", shapes: ["Task_X", "Task_Y"] }]);
        expect(plan.layout).toBe(result);
    });

    it("returns the drawing itself when no shapes overlap", () => {
        const result = layoutOf([TASK_X]);

        expect(planShapeMoves(result, [], [result, result])).toEqual({
            layout: result,
            repairs: [],
        });
    });
});
