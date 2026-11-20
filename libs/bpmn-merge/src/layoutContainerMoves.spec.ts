import { describe, expect, it } from "vitest";

import { rootPlane, subProcessPlane } from "./__fixtures__/shapePlane";
import { type ContainerMovePlan, planContainerMoves } from "./layoutContainerMoves";
import { BUILD_LAYOUT_REPAIRS, planLayoutRepair } from "./layoutDrawingRepair";
import { type DiagramBounds, type Point, liesWithin } from "./layoutGeometry";
import type { LaneShape, LayoutEdge, LayoutModel, LayoutShape, NodeShape } from "./layoutModel";
import { introducedLayoutSpots } from "./layoutSpotDetection";
import { innerBoundsOf } from "./layoutPlacementFrames";
import type { LayoutSpot } from "./layoutSpots";

const PLANE = "Collaboration_1";

const box = (x: number, y: number, width = 100, height = 80): DiagramBounds => ({
    x,
    y,
    width,
    height,
});

const at = (x: number, y: number): Point => ({ x, y });

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

function pool(bounds: DiagramBounds = box(0, 0, 1200, 300)): LayoutShape {
    return {
        kind: "pool",
        id: "Pool_1",
        ...rootPlane(PLANE),
        outline: "rectangle",
        bounds,
    };
}

function lane(id: string, bounds: DiagramBounds): LaneShape {
    const relations = { parent: "Process_1", pool: "Pool_1" };
    return {
        kind: "lane",
        id,
        ...rootPlane(PLANE),
        outline: "rectangle",
        ...relations,
        bounds,
    };
}

const FRAMES = [pool(), lane("Lane_1", box(30, 0, 1170, 300))];

function flow(id: string, source: string, target: string, waypoints: readonly Point[]): LayoutEdge {
    return { id, plane: PLANE, source, target, waypoints, kind: "sequenceFlow" };
}

function layoutOf(
    shapes: readonly LayoutShape[],
    edges: readonly LayoutEdge[] = [],
    frames: readonly LayoutShape[] = FRAMES,
): LayoutModel {
    return {
        shapes: new Map([...frames, ...shapes].map((shape) => [shape.id, shape])),
        edges: new Map(edges.map((edge) => [edge.id, edge])),
    };
}

function planOf(result: LayoutModel, sides: readonly LayoutModel[]): ContainerMovePlan {
    return planContainerMoves(result, introducedLayoutSpots(result, sides), sides);
}

const boundsIn = (plan: ContainerMovePlan, id: string) => plan.layout.shapes.get(id)?.bounds;

/** Each repair of a shape outside its container, with the shape and the container. */
const shapeRepairsOf = (plan: ContainerMovePlan) =>
    plan.repairs.flatMap(({ spot, repair }) =>
        spot.kind === "shapeOutsideContainer"
            ? [{ ...repair, shape: spot.shape, container: spot.container }]
            : [],
    );

/** Each repair of an overlap, with the pair sorted. */
const overlapRepairsOf = (plan: ContainerMovePlan) =>
    plan.repairs.flatMap(({ spot, repair }) =>
        spot.kind === "shapesOverlap" ? [{ ...repair, shapes: [...spot.shapes].sort() }] : [],
    );

/**
 * A sub-process its contents fill, with a boundary event on its bottom border
 * lying on a task inside, and a task the build placed below it that only
 * growing the sub-process in place brings inside.
 */
function overlapEndedByGrowth(): [LayoutModel, LayoutModel[]] {
    const tall = [pool(box(0, 0, 1200, 400)), lane("Lane_1", box(30, 0, 1170, 400))];
    const sub = node("Sub_1", box(200, 50, 300, 200), { expanded: true });
    const tallTask = node("Task_1", box(220, 80, 100, 160), IN_SUB);
    const beside = node("Task_2", box(340, 80, 140, 160), IN_SUB);
    const timer = node("Timer_B", box(252, 232, 36, 36), { host: "Sub_1", outline: "circle" });
    const added = node("Task_Z", box(380, 250, 100, 80), IN_SUB);
    const result = layoutOf([sub, tallTask, beside, timer, added], [], tall);
    const current = layoutOf(
        [sub, { ...tallTask, bounds: box(220, 80, 100, 140) }, beside, timer],
        [],
        tall,
    );
    const incoming = layoutOf(
        [
            { ...sub, bounds: box(200, 50, 300, 300) },
            tallTask,
            beside,
            { ...timer, bounds: box(252, 332, 36, 36) },
            added,
        ],
        [],
        tall,
    );
    return [result, [current, incoming]];
}

const outsideOf = (layout: LayoutModel, sides: readonly LayoutModel[]): LayoutSpot[] =>
    introducedLayoutSpots(layout, sides).filter(({ kind }) => kind === "shapeOutsideContainer");

const IN_SUB = { subProcesses: ["Sub_1"] };

describe("planContainerMoves", () => {
    it("moves a shape with its sub-process as the side that drew it moved the sub-process, carrying its label and boundary events", () => {
        const movedSub = node("Sub_1", box(600, 40, 300, 200), { expanded: true });
        const task = node("Task_In", box(340, 80), { ...IN_SUB, label: box(350, 165, 80, 14) });
        const timer = node("Timer_1", box(422, 142, 36, 36), {
            ...IN_SUB,
            host: "Task_In",
            outline: "circle",
        });
        const result = layoutOf([movedSub, task, timer]);
        const current = layoutOf([{ ...movedSub, bounds: box(300, 40, 300, 200) }, task, timer]);
        const incoming = layoutOf([movedSub]);

        const plan = planOf(result, [current, incoming]);

        expect(shapeRepairsOf(plan)).toEqual([
            { kind: "movedIntoContainer", shape: "Task_In", container: "Sub_1" },
            { kind: "movedIntoContainer", shape: "Timer_1", container: "Sub_1" },
        ]);
        expect(boundsIn(plan, "Task_In")).toEqual(box(640, 80));
        expect(boundsIn(plan, "Timer_1")).toEqual(box(722, 142, 36, 36));
        expect((plan.layout.shapes.get("Task_In") as NodeShape).label).toEqual(
            box(650, 165, 80, 14),
        );
        expect(outsideOf(plan.layout, [current, incoming])).toEqual([]);
    });

    it("follows a sibling it shares with the side that drew it when that side draws the sub-process at another size", () => {
        const sub = node("Sub_1", box(600, 40, 300, 200), { expanded: true });
        const sibling = node("Task_A", box(700, 100), IN_SUB);
        const start = node("Start_In", box(40, 122, 36, 36), { ...IN_SUB, outline: "circle" });
        const result = layoutOf([sub, sibling, start]);
        const current = layoutOf([sub, sibling]);
        const onItsPlane = subProcessPlane("Sub_1");
        const incoming = layoutOf([
            { ...sub, bounds: box(600, 40, 100, 80), expanded: false },
            { ...sibling, ...onItsPlane, bounds: box(100, 100) },
            { ...start, ...onItsPlane },
        ]);

        const plan = planOf(result, [current, incoming]);

        expect(shapeRepairsOf(plan)).toEqual([
            { kind: "movedIntoContainer", shape: "Start_In", container: "Sub_1" },
        ]);
        expect(boundsIn(plan, "Start_In")).toEqual(box(640, 122, 36, 36));
    });

    it("follows a side only to a place off the container's border, as the nearest place inside keeps", () => {
        const sub = node("Sub_1", box(600, 40, 300, 200), { expanded: true });
        const sibling = node("Task_A", box(661, 100), IN_SUB);
        const start = node("Start_In", box(40, 122, 36, 36), { ...IN_SUB, outline: "circle" });
        const result = layoutOf([sub, sibling, start]);
        const current = layoutOf([sub, sibling]);
        const onItsPlane = subProcessPlane("Sub_1");
        const incoming = layoutOf([
            { ...sub, bounds: box(600, 40, 100, 80), expanded: false },
            { ...sibling, ...onItsPlane, bounds: box(100, 100) },
            { ...start, ...onItsPlane },
        ]);

        const plan = planOf(result, [current, incoming]);

        expect(shapeRepairsOf(plan)).toEqual([
            { kind: "movedIntoContainer", shape: "Start_In", container: "Sub_1" },
        ]);
        expect(liesWithin(boundsIn(plan, "Start_In")!, innerBoundsOf(sub))).toBe(true);
    });

    it("leaves a shape both sides draw where it lies outside its container, as the build did not place it", () => {
        const upper = lane("Lane_1", box(30, 0, 1170, 150));
        const lower = lane("Lane_2", box(30, 150, 1170, 150));
        const task = node("Task_M", box(300, 180));
        const result = layoutOf([task], [], [pool(), upper, lower]);
        const current = layoutOf([{ ...task, lanes: ["Lane_2"] }], [], [pool(), upper, lower]);
        const incoming = layoutOf(
            [task],
            [],
            [
                pool(),
                { ...upper, bounds: box(30, 0, 1170, 270) },
                { ...lower, bounds: box(30, 270, 1170, 30) },
            ],
        );

        const plan = planOf(result, [current, incoming]);

        expect(shapeRepairsOf(plan)).toEqual([
            { kind: "notRepaired", shape: "Task_M", container: "Lane_1" },
        ]);
        expect(plan.layout).toBe(result);
    });

    it("moves a shape to the nearest free place inside its sub-process when no move of a side fits", () => {
        const sub = node("Sub_1", box(400, 40, 300, 200), { expanded: true });
        const sibling = node("Task_A", box(450, 100), IN_SUB);
        const added = node("Task_N", box(110, 100), IN_SUB);
        const result = layoutOf([sub, sibling, added]);
        const current = layoutOf([sub, sibling]);
        const incoming = layoutOf([{ ...sub, bounds: box(100, 40, 600, 200) }, sibling, added]);

        const plan = planOf(result, [current, incoming]);

        expect(shapeRepairsOf(plan)).toEqual([
            { kind: "movedIntoContainer", shape: "Task_N", container: "Sub_1" },
        ]);
        expect(boundsIn(plan, "Task_N")).toEqual(box(570, 100));
        expect(boundsIn(plan, "Task_A")).toEqual(sibling.bounds);
    });

    describe("in lanes", () => {
        const upper = lane("Lane_1", box(30, 0, 1170, 150));
        const lower = lane("Lane_2", box(30, 150, 1170, 150));
        const twoLanes = [pool(), upper, lower];

        it("brings a shape back into its own lane's band when the band holds it", () => {
            const task = node("Task_M", box(300, 180));
            const result = layoutOf([task], [], twoLanes);
            const current = layoutOf([{ ...task, lanes: ["Lane_2"] }], [], twoLanes);
            const incoming = layoutOf([{ ...task, bounds: box(300, 30) }], [], twoLanes);

            const plan = planOf(result, [current, incoming]);

            expect(shapeRepairsOf(plan)).toEqual([
                { kind: "movedIntoContainer", shape: "Task_M", container: "Lane_1" },
            ]);
            expect(boundsIn(plan, "Task_M")).toEqual(box(300, 60));
            expect(boundsIn(plan, "Lane_1")).toEqual(upper.bounds);
        });

        it("brings a shape both sides draw where it lies into a lane the build stacked below the others", () => {
            const member = node("Task_M", box(300, 40), { lanes: ["Lane_2"] });
            const result = layoutOf([member], [], twoLanes);
            const current = layoutOf([member], [], [pool(), upper]);
            const incoming = layoutOf([member], [], [pool(), { ...lower, bounds: upper.bounds }]);

            const plan = planOf(result, [current, incoming]);

            expect(shapeRepairsOf(plan)).toEqual([
                { kind: "movedIntoContainer", shape: "Task_M", container: "Lane_2" },
            ]);
            expect(boundsIn(plan, "Task_M")).toEqual(box(300, 190));
        });

        it("brings a shape into its sub-process in another lane, as the sub-process stands for its contents there", () => {
            const sub = node("Sub_1", box(400, 170, 300, 120), {
                expanded: true,
                lanes: ["Lane_2"],
            });
            const added = node("Task_N", box(100, 40), IN_SUB);
            const result = layoutOf([sub, added], [], twoLanes);
            const current = layoutOf([sub], [], twoLanes);
            const incoming = layoutOf(
                [{ ...sub, bounds: box(100, 20, 600, 270) }, added],
                [],
                twoLanes,
            );

            const plan = planOf(result, [current, incoming]);

            expect(shapeRepairsOf(plan)).toEqual([
                { kind: "movedIntoContainer", shape: "Task_N", container: "Sub_1" },
            ]);
            expect(boundsIn(plan, "Task_N")).toEqual(box(410, 200));
        });

        it("leaves a shape outside its lane, and grows no lane, when the band cannot hold it", () => {
            const narrow = lane("Lane_1", box(30, 0, 1170, 90));
            const frames = [pool(), narrow, lane("Lane_2", box(30, 90, 1170, 210))];
            const task = node("Task_M", box(300, 180));
            const result = layoutOf([task], [], frames);
            const current = layoutOf([{ ...task, lanes: ["Lane_2"] }], [], frames);

            const plan = planOf(result, [current, current]);

            expect(shapeRepairsOf(plan)).toEqual([
                { kind: "notRepaired", shape: "Task_M", container: "Lane_1" },
            ]);
            expect(plan.layout).toBe(result);
        });
    });

    describe("without a free place inside", () => {
        it("grows the pool and its lanes sideways to hold the shape", () => {
            const narrowFrames = [pool(box(0, 0, 600, 200)), lane("Lane_1", box(30, 0, 570, 200))];
            const row = [60, 180, 300, 420].map((x, index) => node(`Task_${index}`, box(x, 60)));
            const added = node("Task_Z", box(560, 60));
            const result = layoutOf([...row, added], [], narrowFrames);
            const current = layoutOf(row, [], narrowFrames);
            const incoming = layoutOf(
                [...row, added],
                [],
                [pool(box(0, 0, 800, 200)), lane("Lane_1", box(30, 0, 770, 200))],
            );

            const plan = planOf(result, [current, incoming]);

            expect(shapeRepairsOf(plan)).toEqual([
                { kind: "grewContainer", shape: "Task_Z", container: "Pool_1" },
                { kind: "grewContainer", shape: "Task_Z", container: "Lane_1" },
            ]);
            expect(boundsIn(plan, "Pool_1")).toEqual(box(0, 0, 670, 200));
            expect(boundsIn(plan, "Lane_1")).toEqual(box(30, 0, 640, 200));
            expect(boundsIn(plan, "Task_Z")).toEqual(added.bounds);
        });

        it("grows an expanded sub-process and shifts what it lands on, listing what it shifted, the pool only as far as needed", () => {
            const sub = node("Sub_1", box(200, 50, 300, 200), { expanded: true });
            const contents = [
                node("Task_1", box(220, 70, 100, 160), IN_SUB),
                node("Task_2", box(360, 70, 100, 160), IN_SUB),
            ];
            const after = node("Task_After", box(560, 110));
            const added = node("Task_Z", box(480, 110), IN_SUB);
            const out = flow("Flow_Out", "Sub_1", "Task_After", [at(500, 150), at(560, 150)]);
            const result = layoutOf([sub, ...contents, after, added], [out]);
            const current = layoutOf([sub, ...contents, after], [out]);
            const incoming = layoutOf([
                { ...sub, bounds: box(200, 50, 400, 200) },
                ...contents,
                added,
            ]);

            const plan = planOf(result, [current, incoming]);

            expect(shapeRepairsOf(plan)).toEqual([
                {
                    kind: "grewContainerAndShifted",
                    shape: "Task_Z",
                    container: "Sub_1",
                    shifted: ["Task_After"],
                },
            ]);
            expect(boundsIn(plan, "Sub_1")).toEqual(box(200, 50, 390, 200));
            expect(boundsIn(plan, "Task_After")).toEqual(box(650, 110));
            expect(boundsIn(plan, "Pool_1")).toEqual(box(0, 0, 1200, 300));
            expect(boundsIn(plan, "Lane_1")).toEqual(box(30, 0, 1170, 300));
            expect(plan.layout.edges.get("Flow_Out")?.waypoints).toEqual([
                at(500, 150),
                at(650, 150),
            ]);
            expect(boundsIn(plan, "Task_Z")).toEqual(added.bounds);
        });

        it("moves the sub-process's boundary events with the border it grows, leaving the others", () => {
            const sub = node("Sub_1", box(200, 50, 300, 200), { expanded: true });
            const contents = [
                node("Task_1", box(220, 70, 100, 160), IN_SUB),
                node("Task_2", box(360, 70, 100, 160), IN_SUB),
            ];
            const onRight = node("Timer_R", box(482, 62, 36, 36), {
                host: "Sub_1",
                outline: "circle",
            });
            const onLeft = node("Timer_L", box(182, 62, 36, 36), {
                host: "Sub_1",
                outline: "circle",
            });
            const after = node("Task_After", box(560, 110));
            const added = node("Task_Z", box(480, 110), IN_SUB);
            const result = layoutOf([sub, ...contents, onRight, onLeft, after, added]);
            const current = layoutOf([sub, ...contents, onRight, onLeft, after]);
            const incoming = layoutOf([
                { ...sub, bounds: box(200, 50, 400, 200) },
                ...contents,
                onRight,
                onLeft,
                added,
            ]);

            const plan = planOf(result, [current, incoming]);

            expect(shapeRepairsOf(plan)).toEqual([
                {
                    kind: "grewContainerAndShifted",
                    shape: "Task_Z",
                    container: "Sub_1",
                    shifted: ["Task_After"],
                },
            ]);
            expect(boundsIn(plan, "Sub_1")).toEqual(box(200, 50, 390, 200));
            expect(boundsIn(plan, "Timer_R")).toEqual(box(572, 62, 36, 36));
            expect(boundsIn(plan, "Timer_L")).toEqual(onLeft.bounds);
        });

        it("names an overlap it ended by moving a boundary event with the border it grew after the event", () => {
            const plan = planOf(...overlapEndedByGrowth());

            expect(shapeRepairsOf(plan)).toEqual([
                { kind: "grewContainer", shape: "Task_Z", container: "Sub_1" },
            ]);
            expect(boundsIn(plan, "Timer_B")).toEqual(box(252, 322, 36, 36));
            expect(overlapRepairsOf(plan)).toEqual([
                { kind: "movedByBuild", moved: "Timer_B", shapes: ["Task_1", "Timer_B"] },
            ]);
        });

        it("grows no pool over the pool beside it", () => {
            const narrowFrames = [pool(box(0, 0, 600, 200)), lane("Lane_1", box(30, 0, 570, 200))];
            const beside: LayoutShape = { ...pool(box(662, 0, 600, 200)), id: "Pool_2" };
            const row = [60, 180, 300, 420].map((x, index) => node(`Task_${index}`, box(x, 60)));
            const added = node("Task_Z", box(560, 60));
            const result = layoutOf([...row, added], [], [...narrowFrames, beside]);
            const current = layoutOf(row, [], [...narrowFrames, beside]);
            const incoming = layoutOf(
                [...row, added],
                [],
                [pool(box(0, 0, 800, 200)), lane("Lane_1", box(30, 0, 770, 200)), beside],
            );

            const plan = planOf(result, [current, incoming]);

            expect(shapeRepairsOf(plan)).toEqual([
                { kind: "notRepaired", shape: "Task_Z", container: "Pool_1" },
                { kind: "notRepaired", shape: "Task_Z", container: "Lane_1" },
            ]);
            expect(plan.layout).toBe(result);
        });

        it("leaves the shape outside when growing its sub-process would cover another shape", () => {
            const sub = node("Sub_1", box(200, 50, 300, 200), { expanded: true });
            const contents = [
                node("Task_1", box(220, 70, 100, 160), IN_SUB),
                node("Task_2", box(360, 70, 100, 160), IN_SUB),
            ];
            const below = node("Task_Below", box(300, 280, 100, 10));
            const added = node("Task_Z", box(380, 220), IN_SUB);
            const tall = [pool(box(0, 0, 1200, 400)), lane("Lane_1", box(30, 0, 1170, 400))];
            const result = layoutOf([sub, ...contents, below, added], [], tall);
            const current = layoutOf([sub, ...contents, below], [], tall);
            const incoming = layoutOf(
                [{ ...sub, bounds: box(200, 50, 300, 300) }, ...contents, added],
                [],
                tall,
            );

            const plan = planOf(result, [current, incoming]);

            expect(shapeRepairsOf(plan)).toEqual([
                { kind: "notRepaired", shape: "Task_Z", container: "Sub_1" },
            ]);
            expect(plan.layout).toBe(result);
        });
    });

    it("moves no boundary event on its own, as it stays on its host", () => {
        const sub = node("Sub_1", box(200, 50, 300, 200), { expanded: true });
        const host = node("Task_H", box(380, 100), IN_SUB);
        const timer = node("Timer_1", box(520, 122, 36, 36), {
            ...IN_SUB,
            host: "Task_H",
            outline: "circle",
        });
        const result = layoutOf([sub, host, timer]);
        const current = layoutOf([sub, host]);
        const incoming = layoutOf([{ ...sub, bounds: box(200, 50, 400, 200) }, host, timer]);

        const plan = planOf(result, [current, incoming]);

        expect(shapeRepairsOf(plan)).toEqual([
            { kind: "notRepaired", shape: "Timer_1", container: "Sub_1" },
        ]);
        expect(plan.layout).toBe(result);
    });

    it("names an overlap of the spots after the first shape of the pair it moved, and leaves the overlaps it moved no shape of", () => {
        const movedSub = node("Sub_1", box(600, 40, 300, 200), { expanded: true });
        const task = node("Task_In", box(340, 80), IN_SUB);
        const result = layoutOf([movedSub, task]);
        const current = layoutOf([{ ...movedSub, bounds: box(300, 40, 300, 200) }, task]);
        const sides = [current, layoutOf([movedSub])];
        const movedOff = { kind: "shapesOverlap", shapes: ["Task_Y", "Task_In"] } as const;
        const untouched = { kind: "shapesOverlap", shapes: ["Task_Y", "Task_Z"] } as const;

        const plan = planContainerMoves(
            result,
            [...introducedLayoutSpots(result, sides), movedOff, untouched],
            sides,
        );

        expect(plan.repairs.filter(({ spot }) => spot.kind === "shapesOverlap")).toEqual([
            { spot: movedOff, repair: { kind: "movedByBuild", moved: "Task_In" } },
        ]);
    });

    it("returns the drawing itself when no shape lies outside its container", () => {
        const result = layoutOf([node("Task_1", box(300, 100))]);

        expect(planContainerMoves(result, [], [result, result])).toEqual({
            layout: result,
            repairs: [],
        });
    });
});

describe("the build's notes of a container repair", () => {
    it("says the build moved the boundary event the grown border carried off the task it lay on", () => {
        const [result, sides] = overlapEndedByGrowth();

        const { notes } = planLayoutRepair(result, sides, BUILD_LAYOUT_REPAIRS, []);

        expect(notes).toEqual([
            {
                kind: "shapesOverlap",
                ids: expect.arrayContaining(["Task_1", "Timer_B"]),
                repair: "movedByBuild",
                moved: "Timer_B",
            },
            {
                kind: "shapeOutsideContainer",
                id: "Task_Z",
                shapes: ["Sub_1"],
                repair: "grewContainer",
            },
        ]);
    });
});
