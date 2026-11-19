import { describe, expect, it } from "vitest";

import { rootPlane } from "./__fixtures__/shapePlane";
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
        ...rootPlane(PLANE),
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
    ...rootPlane(PLANE),
    outline: "rectangle",
    bounds: box(0, 0, 1200, 300),
};

/** A lane of the pool's full width, `y` to `y + height`. */
function lane(y: number, height: number, width = 1170): LaneShape {
    return {
        kind: "lane",
        id: "Lane_1",
        ...rootPlane(PLANE),
        outline: "rectangle",
        parent: "Process_1",
        pool: "Pool_1",
        bounds: box(30, y, width, height),
    };
}

const at = (x: number, y: number): Point => ({ x, y });

function flow(id: string, source: string, target: string, waypoints: readonly Point[]): LayoutEdge {
    return { id, plane: PLANE, source, target, waypoints, kind: "sequenceFlow" };
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

/** Each overlap's repair with the pair it acted on. */
const pairRepairsOf = (plan: ShapeMovePlan) =>
    plan.repairs.flatMap(({ spot, repair }) =>
        spot.kind === "shapesOverlap" ? [{ ...repair, shapes: spot.shapes }] : [],
    );

const TASK_X = node("Task_X", box(300, 110));

describe("planShapeMoves", () => {
    it("moves a shape the other side drew elsewhere back to that place when it is free", () => {
        const result = layoutOf([TASK_X, node("Task_R", box(310, 110))]);
        const incoming = layoutOf([TASK_X, node("Task_R", box(560, 110))]);

        const plan = planShapeMoves(result, overlapsOf(result), [result, incoming]);

        expect(pairRepairsOf(plan)).toEqual([
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

        expect(pairRepairsOf(plan)).toEqual([
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

    describe("keeps 15 px clear", () => {
        const frames = [POOL, lane(70, 160)];
        const current = layoutOf([TASK_X], [], frames);
        const sideBySide = [TASK_X, node("Task_Y", box(310, 110))];

        it("of a flow that is not the moved shape's own", () => {
            const other = flow("Flow_Other", "Task_A", "Task_B", [at(530, -100), at(530, 400)]);
            const shapes = [
                ...sideBySide,
                node("Task_A", box(480, -200)),
                node("Task_B", box(480, 420)),
            ];
            const result = layoutOf(shapes, [other], frames);

            const plan = planShapeMoves(result, overlapsOf(result), [current, current]);

            expect(boundsIn(plan, "Task_Y")).toEqual(box(180, 110));
        });

        it("of the label of a flow that is not the moved shape's own", () => {
            const labelled = {
                ...flow("Flow_Other", "Task_A", "Task_B", [at(560, 230), at(700, 230)]),
                label: box(525, 120, 20, 14),
            };
            const shapes = [
                ...sideBySide,
                node("Task_A", box(460, 210, 100, 40)),
                node("Task_B", box(700, 210, 100, 40)),
            ];
            const result = layoutOf(shapes, [labelled], [POOL, lane(70, 200)]);

            const plan = planShapeMoves(result, overlapsOf(result), [current, current]);

            expect(boundsIn(plan, "Task_Y")).toEqual(box(180, 110));
        });
    });

    it("keeps a moved shape off the name band of its sub-process", () => {
        const sub = node("Sub_1", box(100, 75, 400, 260), { expanded: true, lanes: [] });
        const inSub = { subProcesses: ["Sub_1"], lanes: [] };
        const prior = node("Task_A", box(130, 190), inSub);
        const tall = [{ ...POOL, bounds: box(0, 0, 1200, 400) }, lane(0, 400)];
        const result = layoutOf([sub, prior, node("Task_Y", box(140, 195), inSub)], [], tall);
        const current = layoutOf([sub, prior], [], tall);

        const plan = planShapeMoves(result, overlapsOf(result), [current, current]);

        expect(boundsIn(plan, "Task_Y")).toEqual(box(250, 195));
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

        expect(pairRepairsOf(plan)).toEqual([
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

        expect(pairRepairsOf(plan)).toEqual([
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

        expect(pairRepairsOf(plan)).toEqual([
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

        it("makes room beyond the other shape, shifts what it lands on, grows the pool and lane to keep the room gap from their border, and lists both", () => {
            const labelled = rowFlows.map((edge) =>
                edge.id === "Flow_3" ? { ...edge, label: box(572, 110, 10, 14) } : edge,
            );
            const result = layoutOf([...row, node("Task_Y", box(470, 90))], labelled, frames);
            const current = layoutOf(row, rowFlows, frames);

            const plan = planShapeMoves(result, overlapsOf(result), [current, current]);

            expect(pairRepairsOf(plan)).toEqual([
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
            expect(boundsIn(plan, "Pool_1")).toEqual(box(0, 0, 1270, 300));
            expect(boundsIn(plan, "Lane_1")).toEqual(box(30, 70, 1240, 120));
            expect(plan.layout.edges.get("Flow_3")?.waypoints).toEqual([
                at(560, 130),
                at(760, 130),
            ]);
            expect(plan.layout.edges.get("Flow_3")?.label).toEqual(box(752, 110, 10, 14));
            expect(plan.layout.edges.get("Flow_4")?.waypoints).toEqual([
                at(860, 130),
                at(880, 130),
            ]);
            expect(overlapsOf(plan.layout)).toEqual([]);
        });

        /** Task_Y dropped into Flow_3: it follows Task_3 and leads into Task_4. */
        const insertedFlows = [
            ...rowFlows.filter(({ id }) => id !== "Flow_3"),
            flow("Flow_3", "Task_3", "Task_Y", [at(560, 130), at(570, 130)]),
            flow("Flow_Y", "Task_Y", "Task_4", [at(570, 130), at(580, 130)]),
        ];

        it("keeps a shape that follows the other in line after it, pushing what follows", () => {
            const result = layoutOf([...row, node("Task_Y", box(470, 90))], insertedFlows, frames);
            const current = layoutOf(row, rowFlows, frames);

            const plan = planShapeMoves(result, overlapsOf(result), [current, current]);

            expect(pairRepairsOf(plan)).toEqual([
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
        });

        it("keeps a shape that leads into the other in its place and pushes the other on, never leftward, the pool keeping the room gap from its border", () => {
            const before = [
                ...rowFlows.filter(({ id }) => id !== "Flow_3"),
                flow("Flow_3", "Task_3", "Task_Y", [at(560, 130), at(590, 130)]),
                flow("Flow_Y", "Task_Y", "Task_4", [at(690, 130), at(580, 130)]),
            ];
            const result = layoutOf([...row, node("Task_Y", box(590, 90))], before, frames);
            const current = layoutOf(row, rowFlows, frames);

            const plan = planShapeMoves(result, overlapsOf(result), [current, current]);

            expect(pairRepairsOf(plan)).toEqual([
                {
                    kind: "madeRoom",
                    shapes: ["Task_4", "Task_Y"],
                    moved: "Task_Y",
                    shifted: ["Task_4", "Task_5", "Task_6", "Task_7"],
                    grown: ["Pool_1", "Lane_1"],
                },
            ]);
            expect(boundsIn(plan, "Task_Y")).toEqual(box(580, 90));
            expect(boundsIn(plan, "Task_4")).toEqual(box(730, 90));
            expect(boundsIn(plan, "Task_3")).toEqual(row[3]!.bounds);
            expect(boundsIn(plan, "Pool_1")).toEqual(box(0, 0, 1240, 300));
        });

        describe("a parallel branch", () => {
            const branches = [
                node("Task_0", box(100, 90)),
                node("Task_1", box(500, 90)),
                node("Task_2", box(700, 90)),
            ];
            const intoJoin = [
                flow("Flow_1", "Task_1", "Task_2", [at(600, 130), at(700, 130)]),
                flow("Flow_Y", "Task_Y", "Task_2", [at(610, 130), at(700, 130)]),
            ];

            it("is stacked under the other shape even with a free place in line, its lane grown to keep the stack gap below it and the lanes below shifted", () => {
                const lower: LaneShape = { ...lane(190, 110), id: "Lane_2" };
                const inLower = node("Task_L", box(800, 200), { lanes: ["Lane_2"] });
                const twoLanes = [POOL, lane(70, 120), lower];
                const shapes = [...branches, inLower];
                const result = layoutOf(
                    [...shapes, node("Task_Y", box(510, 90))],
                    intoJoin,
                    twoLanes,
                );
                const current = layoutOf(shapes, intoJoin.slice(0, 1), twoLanes);

                const plan = planShapeMoves(result, overlapsOf(result), [current, current]);

                expect(pairRepairsOf(plan)).toEqual([
                    {
                        kind: "madeRoom",
                        shapes: ["Task_1", "Task_Y"],
                        moved: "Task_Y",
                        shifted: ["Task_L"],
                        grown: ["Pool_1", "Lane_1"],
                    },
                ]);
                expect(boundsIn(plan, "Task_Y")).toEqual(box(500, 210));
                expect(boundsIn(plan, "Lane_1")).toEqual(box(30, 70, 1170, 240));
                expect(boundsIn(plan, "Lane_2")).toEqual(box(30, 310, 1170, 110));
                expect(boundsIn(plan, "Task_L")).toEqual(box(800, 320));
                expect(boundsIn(plan, "Pool_1")).toEqual(box(0, 0, 1200, 420));
                expect(boundsIn(plan, "Task_2")).toEqual(branches[2]!.bounds);
            });

            it("moves along the flow from under the other shape until it keeps clear of a flow's label", () => {
                const tall = [POOL, lane(70, 240)];
                const gateway = node("Gateway_1", box(445, 15, 50, 50), { outline: "diamond" });
                const down = {
                    ...flow("Flow_Down", "Gateway_1", "Task_D", [at(470, 65), at(470, 400)]),
                    label: box(478, 225, 14, 14),
                };
                const shapes = [...branches, gateway, node("Task_D", box(420, 400))];
                const result = layoutOf(
                    [...shapes, node("Task_Y", box(510, 90))],
                    [...intoJoin, down],
                    tall,
                );
                const current = layoutOf(shapes, [intoJoin[0]!, down], tall);

                const plan = planShapeMoves(result, overlapsOf(result), [current, current]);

                expect(pairRepairsOf(plan)).toEqual([
                    { kind: "movedByBuild", shapes: ["Task_1", "Task_Y"], moved: "Task_Y" },
                ]);
                expect(boundsIn(plan, "Task_Y")).toEqual(box(510, 210));
            });

            it("grows the pool beside the pool level with it by as much, so their bottoms stay level", () => {
                const beside: LayoutShape = {
                    ...POOL,
                    id: "Pool_2",
                    bounds: box(1210, 0, 400, 300),
                };
                const besideLane: LaneShape = {
                    ...lane(0, 300, 370),
                    id: "Lane_P",
                    parent: "Process_2",
                    pool: "Pool_2",
                    bounds: box(1240, 0, 370, 300),
                };
                const withBeside = [...frames, beside, besideLane];
                const result = layoutOf(
                    [...branches, node("Task_Y", box(510, 90))],
                    intoJoin,
                    withBeside,
                );
                const current = layoutOf(branches, intoJoin.slice(0, 1), withBeside);

                const plan = planShapeMoves(result, overlapsOf(result), [current, current]);

                expect(boundsIn(plan, "Task_Y")).toEqual(box(500, 210));
                expect(boundsIn(plan, "Pool_1")).toEqual(box(0, 0, 1200, 420));
                expect(boundsIn(plan, "Pool_2")).toEqual(box(1210, 0, 400, 420));
                expect(boundsIn(plan, "Lane_P")).toEqual(box(1240, 0, 370, 420));
            });

            it("leaves a shape beside the other shape in place when room is made below", () => {
                const neighbour = node("Task_N", box(610, 90));
                const join = node("Task_J", box(800, 90));
                const toJoin = [
                    flow("Flow_1", "Task_1", "Task_J", [at(600, 130), at(800, 130)]),
                    flow("Flow_Y", "Task_Y", "Task_J", [at(610, 130), at(800, 130)]),
                ];
                const shapes = [branches[0]!, branches[1]!, neighbour, join];
                const result = layoutOf([...shapes, node("Task_Y", box(510, 90))], toJoin, frames);
                const current = layoutOf(shapes, toJoin.slice(0, 1), frames);

                const plan = planShapeMoves(result, overlapsOf(result), [current, current]);

                expect(pairRepairsOf(plan)).toEqual([
                    {
                        kind: "madeRoom",
                        shapes: ["Task_1", "Task_Y"],
                        moved: "Task_Y",
                        shifted: [],
                        grown: ["Pool_1", "Lane_1"],
                    },
                ]);
                expect(boundsIn(plan, "Task_Y")).toEqual(box(500, 210));
                expect(plan.layout.shapes.get("Task_N")).toBe(neighbour);
            });

            it("shifts a shape the other shape lies on along the flow when room is made below, as the stacked column gives way as one", () => {
                const underOther = node("Task_N", box(590, 90));
                const join = node("Task_J", box(800, 90));
                const toJoin = [
                    flow("Flow_1", "Task_1", "Task_J", [at(600, 130), at(800, 130)]),
                    flow("Flow_Y", "Task_Y", "Task_J", [at(610, 130), at(800, 130)]),
                ];
                const shapes = [branches[0]!, branches[1]!, underOther, join];
                const result = layoutOf([...shapes, node("Task_Y", box(490, 90))], toJoin, frames);
                const current = layoutOf(shapes, toJoin.slice(0, 1), frames);
                const introduced = overlapsOf(result).filter(
                    (spot) => spot.kind === "shapesOverlap" && spot.shapes.includes("Task_Y"),
                );

                const plan = planShapeMoves(result, introduced, [current, current]);

                expect(pairRepairsOf(plan)).toEqual([
                    {
                        kind: "madeRoom",
                        shapes: ["Task_1", "Task_Y"],
                        moved: "Task_Y",
                        shifted: ["Task_N"],
                        grown: ["Pool_1", "Lane_1"],
                    },
                ]);
                expect(boundsIn(plan, "Task_Y")).toEqual(box(500, 210));
                expect(boundsIn(plan, "Task_N")).toEqual(box(650, 90));
                expect(plan.layout.shapes.get("Task_J")).toBe(join);
            });

            it("is stacked under the host and its boundary events when it lay on a boundary event of a parallel branch", () => {
                const tall = [{ ...POOL, bounds: box(0, 0, 1200, 400) }, lane(70, 300)];
                const timer = node("Timer_1", box(532, 152, 36, 36), {
                    host: "Task_1",
                    outline: "circle",
                });
                const intoHost = flow("Flow_0", "Task_0", "Task_1", [at(200, 130), at(500, 130)]);
                const fromStart = flow("Flow_0Y", "Task_0", "Task_Y", [at(200, 130), at(545, 215)]);
                const shapes = [...branches, timer];
                const result = layoutOf(
                    [...shapes, node("Task_Y", box(545, 176))],
                    [intoHost, fromStart, ...intoJoin],
                    tall,
                );
                const current = layoutOf(shapes, [intoHost, intoJoin[0]!], tall);

                const plan = planShapeMoves(result, overlapsOf(result), [current, current]);

                expect(pairRepairsOf(plan)).toEqual([
                    { kind: "movedByBuild", shapes: ["Timer_1", "Task_Y"], moved: "Task_Y" },
                ]);
                expect(boundsIn(plan, "Task_Y")).toEqual(box(500, 228));
            });

            it("goes to the free place under the other shape without making room", () => {
                const tall = [POOL, lane(70, 240)];
                const result = layoutOf(
                    [...branches, node("Task_Y", box(510, 90))],
                    intoJoin,
                    tall,
                );
                const current = layoutOf(branches, intoJoin.slice(0, 1), tall);

                const plan = planShapeMoves(result, overlapsOf(result), [current, current]);

                expect(pairRepairsOf(plan)).toEqual([
                    { kind: "movedByBuild", shapes: ["Task_1", "Task_Y"], moved: "Task_Y" },
                ]);
                expect(boundsIn(plan, "Task_Y")).toEqual(box(500, 210));
                expect(plan.layout.shapes.get("Lane_1")).toBe(tall[1]);
            });
        });

        it("shifts a shape the moved one would land on that starts before the other shape ends", () => {
            const wide = node("Data_1", box(490, 175, 130, 40));
            const result = layoutOf([...row, wide, node("Task_Y", box(470, 90))], rowFlows, frames);
            const current = layoutOf([...row, wide], rowFlows, frames);

            const plan = planShapeMoves(result, overlapsOf(result), [current, current]);

            expect(pairRepairsOf(plan)).toEqual([
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

            expect(pairRepairsOf(plan)).toEqual([
                { kind: "movedByBuild", shapes: ["Task_0", "Task_Y"], moved: "Task_Y" },
            ]);
            expect(boundsIn(plan, "Task_Y")).toEqual(box(250, 90));
            expect(plan.layout.shapes.get("Task_1")).toBe(far);
            expect(plan.layout.shapes.get("Lane_1")).toBe(frames[1]);
        });

        it("grows the pool and lane to hold the moved shape with the margin they kept when nothing lies past the line", () => {
            const narrow = [{ ...POOL, bounds: box(0, 0, 650, 300) }, lane(70, 120, 620)];
            const short = row.slice(0, 4);
            const result = layoutOf(
                [...short, node("Task_Y", box(470, 90))],
                rowFlows.slice(0, 3),
                narrow,
            );
            const current = layoutOf(short, rowFlows.slice(0, 3), narrow);

            const plan = planShapeMoves(result, overlapsOf(result), [current, current]);

            expect(pairRepairsOf(plan)).toEqual([
                {
                    kind: "madeRoom",
                    shapes: ["Task_3", "Task_Y"],
                    moved: "Task_Y",
                    shifted: [],
                    grown: ["Pool_1", "Lane_1"],
                },
            ]);
            expect(boundsIn(plan, "Task_Y")).toEqual(box(610, 90));
            expect(boundsIn(plan, "Pool_1")).toEqual(box(0, 0, 760, 300));
            expect(boundsIn(plan, "Lane_1")).toEqual(box(30, 70, 730, 120));
        });

        it("names the shape a room shifted off another as the one the build moved", () => {
            const tallPool = { ...POOL, bounds: box(0, 0, 1200, 400) };
            const lowerLane: LaneShape = { ...lane(190, 200), id: "Lane_2" };
            const inLowerLane = { lanes: ["Lane_2"] };
            const shifted = node("Task_C", box(545, 180, 100, 40), inLowerLane);
            const staying = node("Task_D", box(470, 190, 100, 40), inLowerLane);
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

            expect(pairRepairsOf(plan)[0]).toMatchObject({ kind: "madeRoom", moved: "Task_Y" });
            expect(pairRepairsOf(plan)[1]).toEqual({
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

            expect(pairRepairsOf(plan)[0]).toMatchObject({ moved: "Task_A" });
            expect(pairRepairsOf(plan)[1]).toMatchObject({
                kind: "movedByBuild",
                shapes: ["Task_4", "Timer_1"],
                moved: "Timer_1",
            });
        });

        it("shifts the pool beside it instead of growing the pool over it", () => {
            const beside: LayoutShape = { ...POOL, id: "Pool_2", bounds: box(1210, 0, 300, 300) };
            const inBeside = node("Task_P", box(1300, 90), { pool: "Pool_2", lanes: ["Lane_P"] });
            const besideLane: LaneShape = {
                ...lane(0, 300, 270),
                id: "Lane_P",
                parent: "Process_2",
                pool: "Pool_2",
                bounds: box(1240, 0, 270, 300),
            };
            const withBeside = [...frames, beside, besideLane];
            const result = layoutOf(
                [...row, inBeside, node("Task_Y", box(470, 90))],
                rowFlows,
                withBeside,
            );
            const current = layoutOf([...row, inBeside], rowFlows, withBeside);

            const plan = planShapeMoves(result, overlapsOf(result), [current, current]);

            expect(pairRepairsOf(plan)).toEqual([
                {
                    kind: "madeRoom",
                    shapes: ["Task_3", "Task_Y"],
                    moved: "Task_Y",
                    shifted: ["Pool_2", "Task_4", "Task_5", "Task_6", "Task_7"],
                    grown: ["Pool_1", "Lane_1"],
                },
            ]);
            expect(boundsIn(plan, "Pool_1")).toEqual(box(0, 0, 1270, 300));
            expect(boundsIn(plan, "Pool_2")).toEqual(box(1280, 0, 300, 300));
            expect(boundsIn(plan, "Task_P")).toEqual(box(1370, 90));
            expect(boundsIn(plan, "Lane_P")).toEqual(box(1310, 0, 270, 300));
        });

        it.each([0, 10])(
            "widens the pool though another pool lies %i px below it, as the widening comes no nearer",
            (gap) => {
                const below: LayoutShape = {
                    ...POOL,
                    id: "Pool_2",
                    bounds: box(0, 300 + gap, 1200, 200),
                };
                const inBelow = node("Task_Q", box(300, 360 + gap), { pool: "Pool_2", lanes: [] });
                const withBelow = [...frames, below];
                const result = layoutOf(
                    [...row, inBelow, node("Task_Y", box(470, 90))],
                    rowFlows,
                    withBelow,
                );
                const current = layoutOf([...row, inBelow], rowFlows, withBelow);

                const plan = planShapeMoves(result, overlapsOf(result), [current, current]);

                expect(pairRepairsOf(plan)[0]).toMatchObject({
                    kind: "madeRoom",
                    grown: ["Pool_1", "Lane_1"],
                });
                expect(boundsIn(plan, "Pool_2")).toEqual(below.bounds);
            },
        );

        it("keeps the gap from a shifted shape to the shape it flows into", () => {
            const [first, second, other] = [100, 220, 340].map((x, index) =>
                node(`Task_${index}`, box(x, 90)),
            );
            const ship = node("Task_Ship", box(600, 90));
            const shipped = node("End_Shipped", box(770, 112, 36, 36), { outline: "circle" });
            const flows = [
                flow("Flow_0", "Task_0", "Task_1", [at(200, 130), at(220, 130)]),
                flow("Flow_1", "Task_1", "Task_2", [at(320, 130), at(340, 130)]),
                flow("Flow_2", "Task_2", "Task_Ship", [at(440, 130), at(600, 130)]),
                flow("Flow_3", "Task_Ship", "End_Shipped", [at(700, 130), at(770, 130)]),
            ];
            const shapes = [first, second, other, ship, shipped];
            const result = layoutOf([...shapes, node("Task_Y", box(350, 90))], flows, frames);
            const current = layoutOf(shapes, flows, frames);

            const plan = planShapeMoves(result, overlapsOf(result), [current, current]);

            expect(pairRepairsOf(plan)).toEqual([
                {
                    kind: "madeRoom",
                    shapes: ["Task_2", "Task_Y"],
                    moved: "Task_Y",
                    shifted: ["Task_Ship", "End_Shipped"],
                    grown: [],
                },
            ]);
            expect(boundsIn(plan, "Task_Y")).toEqual(box(490, 90));
            expect(boundsIn(plan, "Task_Ship")).toEqual(box(640, 90));
            expect(boundsIn(plan, "End_Shipped")).toEqual(box(810, 112, 36, 36));
        });

        it("grows the sub-process to keep the room gap from its border and shifts what lies beyond it instead of covering it", () => {
            const tallLane = [POOL, lane(60, 200)];
            const inSub = { subProcesses: ["Sub_1"] };
            const sub = node("Sub_1", box(100, 75, 380, 120), { expanded: true });
            const outside = node("Task_K", box(500, 90));
            const [first, prior] = [
                node("Task_A", box(130, 95), inSub),
                node("Task_X", box(270, 95), inSub),
            ];
            const timer = node("Timer_1", box(462, 176, 36, 36), {
                host: "Sub_1",
                outline: "circle",
            });
            const below = node("Task_Below", box(500, 215, 100, 40));
            const flows = [
                flow("Flow_A", "Task_A", "Task_X", [at(230, 135), at(270, 135)]),
                flow("Flow_Down", "Task_K", "Task_Below", [at(550, 170), at(550, 215)]),
            ];
            const shapes = [sub, first, prior, outside, timer, below];
            const result = layoutOf(
                [...shapes, node("Task_Y", box(280, 95), inSub)],
                flows,
                tallLane,
            );
            const current = layoutOf(shapes, flows, tallLane);

            const plan = planShapeMoves(result, overlapsOf(result), [current, current]);

            expect(pairRepairsOf(plan)).toEqual([
                {
                    kind: "madeRoom",
                    shapes: ["Task_X", "Task_Y"],
                    moved: "Task_Y",
                    shifted: ["Task_K"],
                    grown: ["Sub_1"],
                },
            ]);
            expect(boundsIn(plan, "Task_Y")).toEqual(box(420, 95));
            expect(boundsIn(plan, "Sub_1")).toEqual(box(100, 75, 470, 120));
            expect(boundsIn(plan, "Task_K")).toEqual(box(590, 90));
            expect(boundsIn(plan, "Timer_1")).toEqual(box(552, 176, 36, 36));
            expect(boundsIn(plan, "Task_Below")).toEqual(below.bounds);
            expect(plan.layout.edges.get("Flow_Down")?.waypoints).toEqual([
                at(640, 170),
                at(640, 192.5),
                at(550, 192.5),
                at(550, 215),
            ]);
            expect(plan.layout.shapes.get("Pool_1")).toBe(POOL);
        });

        it("widens the sub-process though a shape lies 10 px below its far end", () => {
            const tallLane = [POOL, lane(60, 220)];
            const inSub = { subProcesses: ["Sub_1"] };
            const sub = node("Sub_1", box(100, 75, 380, 120), { expanded: true });
            const outside = node("Task_K", box(500, 90));
            const [first, prior] = [
                node("Task_A", box(130, 95), inSub),
                node("Task_X", box(270, 95), inSub),
            ];
            const below = node("Task_Below", box(420, 205, 100, 40));
            const flows = [flow("Flow_A", "Task_A", "Task_X", [at(230, 135), at(270, 135)])];
            const shapes = [sub, first, prior, outside, below];
            const result = layoutOf(
                [...shapes, node("Task_Y", box(280, 95), inSub)],
                flows,
                tallLane,
            );
            const current = layoutOf(shapes, flows, tallLane);

            const plan = planShapeMoves(result, overlapsOf(result), [current, current]);

            expect(pairRepairsOf(plan)).toEqual([
                {
                    kind: "madeRoom",
                    shapes: ["Task_X", "Task_Y"],
                    moved: "Task_Y",
                    shifted: ["Task_K"],
                    grown: ["Sub_1"],
                },
            ]);
            expect(boundsIn(plan, "Task_Below")).toEqual(below.bounds);
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

            expect(pairRepairsOf(plan)).toEqual([
                { kind: "notRepaired", shapes: ["Task_O", "Task_Y"] },
            ]);
            expect(plan.layout).toBe(result);
        });
    });

    it("leaves an overlap of two shapes both sides draw where the result does", () => {
        const result = layoutOf([TASK_X, node("Task_Y", box(310, 110))]);
        const spot: LayoutSpot = { kind: "shapesOverlap", shapes: ["Task_X", "Task_Y"] };

        const plan = planShapeMoves(result, [spot], [result, result]);

        expect(pairRepairsOf(plan)).toEqual([
            { kind: "notRepaired", shapes: ["Task_X", "Task_Y"] },
        ]);
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
