import { describe, expect, it } from "vitest";

import {
    PLANE,
    PROCESS_PLANE,
    box,
    flow,
    lane,
    layoutOf,
    node as buildNode,
    onProcessPlane,
    pool,
} from "./__fixtures__/layoutShapes";
import type { Axis } from "./layoutAxis";
import { DrawingDraft } from "./layoutDrawingDraft";
import type { DiagramBounds, Point } from "./layoutGeometry";
import type { LaneShape, LayoutModel, NodeShape } from "./layoutModel";
import { ShapeGroups } from "./layoutShapeGroups";
import { SpaceTool } from "./layoutSpaceTool";

/** Along y the drawing is the one along x mirrored at its diagonal. */
const oriented = (axis: Axis, { x, y, width, height }: DiagramBounds): DiagramBounds =>
    axis === "x" ? { x, y, width, height } : { x: y, y: x, width: height, height: width };

const point = (axis: Axis, x: number, y: number): Point =>
    axis === "x" ? { x, y } : { x: y, y: x };

const node = (axis: Axis, id: string, bounds: DiagramBounds, relations: Partial<NodeShape> = {}) =>
    buildNode(id, { bounds: oriented(axis, bounds), ...relations });

const frame = (axis: Axis, id: string, bounds: DiagramBounds, relations: Partial<LaneShape> = {}) =>
    lane(id, oriented(axis, bounds), relations);

/**
 * Along x: Task_A before the line at 340, Task_B past it by its center with
 * a boundary event whose own center lies before it, a sub-process across
 * the line by its near side with a content past it, a frame the band opens
 * in and a frame past the line.
 */
function drawingAlong(axis: Axis): LayoutModel {
    const shapes = [
        frame(axis, "Frame_Open", box(0, 0, 1000, 600)),
        frame(axis, "Frame_Past", box(1100, 0, 200, 600)),
        node(axis, "Task_A", box(100, 100)),
        node(axis, "Task_B", box(300, 100)),
        node(axis, "Event_B", box(282, 162, 36, 36), { host: "Task_B" }),
        node(axis, "Sub_1", box(320, 300, 300, 200), { expanded: true }),
        node(axis, "Task_S", box(400, 360), { subProcesses: ["Sub_1"] }),
    ];
    const route = [point(axis, 200, 140), point(axis, 300, 140)];
    return onProcessPlane(layoutOf(shapes, [flow("Flow_1", "Task_A", "Task_B", route)]));
}

describe("SpaceTool.openBand", () => {
    it.each(["x", "y"] as const)("opens a band at a line along %s", (axis) => {
        const layout = drawingAlong(axis);
        const before = DrawingDraft.of(layout);
        const trial = before.fork();
        const tool = new SpaceTool(before, trial, new ShapeGroups(layout), axis);
        const frames = ["Frame_Open", "Frame_Past"].map((id) => layout.shapes.get(id)!);

        tool.openBand({
            line: 340,
            by: 100,
            units: tool.unitsIn(PROCESS_PLANE, undefined, new Set()),
            frames,
            growing: new Set(["Frame_Open"]),
        });
        tool.stretchEdges(PROCESS_PLANE, new Set(), 340);

        const boundsOf = (id: string) => trial.shapes.get(id)!.bounds;
        expect(boundsOf("Task_A")).toEqual(oriented(axis, box(100, 100)));
        expect(boundsOf("Task_B")).toEqual(oriented(axis, box(400, 100)));
        expect(boundsOf("Event_B")).toEqual(oriented(axis, box(382, 162, 36, 36)));
        expect(boundsOf("Sub_1")).toEqual(oriented(axis, box(320, 300, 300, 200)));
        expect(boundsOf("Task_S")).toEqual(oriented(axis, box(400, 360)));
        expect(boundsOf("Frame_Open")).toEqual(oriented(axis, box(0, 0, 1100, 600)));
        expect(boundsOf("Frame_Past")).toEqual(oriented(axis, box(1200, 0, 200, 600)));
        expect(trial.edges.get("Flow_1")!.waypoints).toEqual([
            point(axis, 200, 140),
            point(axis, 400, 140),
        ]);
        expect(tool.shifted).toEqual(["Frame_Past", "Task_B"]);
        expect(tool.moved).toEqual(["Task_B", "Event_B", "Frame_Past"]);
    });

    it("shifts a unit that already gave way no further", () => {
        const layout = drawingAlong("x");
        const before = DrawingDraft.of(layout);
        const trial = before.fork();
        const tool = new SpaceTool(before, trial, new ShapeGroups(layout), "x");
        const units = tool.unitsIn(PROCESS_PLANE, undefined, new Set());
        tool.shiftUnit(
            units.find(({ id }) => id === "Task_B")!,
            50,
        );

        tool.openBand({ line: 340, by: 100, units, frames: [], growing: new Set() });

        expect(trial.shapes.get("Task_B")!.bounds).toEqual(box(350, 100));
    });

    it("names a lane past the line that shifts with its parent lane only through the parent", () => {
        const shapes = [
            frame("x", "Lane_Open", box(0, 0, 300, 600)),
            frame("x", "Lane_Past", box(400, 0, 400, 600)),
            frame("x", "Lane_Child", box(430, 0, 370, 600), { parent: "Lane_Past" }),
            frame("x", "Lane_Nested", box(600, 0, 200, 600), { parent: "Lane_Open" }),
        ];
        const layout = onProcessPlane(layoutOf(shapes));
        const before = DrawingDraft.of(layout);
        const tool = new SpaceTool(before, before.fork(), new ShapeGroups(layout), "x");

        tool.openBand({
            line: 340,
            by: 100,
            units: [],
            frames: [...layout.shapes.values()].reverse(),
            growing: new Set(["Lane_Open"]),
        });

        expect(tool.shifted).toEqual(["Lane_Past", "Lane_Nested"]);
        expect(tool.moved).toEqual(["Lane_Nested", "Lane_Child", "Lane_Past"]);
    });
});

describe("SpaceTool.shiftedBy", () => {
    it("merges what several tools shifted into the drawing's document order, each shape once", () => {
        const layout = drawingAlong("x");
        const before = DrawingDraft.of(layout);
        const units = new SpaceTool(before, before.fork(), new ShapeGroups(layout), "x").unitsIn(
            PROCESS_PLANE,
            undefined,
            new Set(),
        );
        const toolShifting = (...ids: string[]) => {
            const tool = new SpaceTool(before, before.fork(), new ShapeGroups(layout), "x");
            const unitNamed = (id: string) => units.find((unit) => unit.id === id)!;
            for (const id of ids) tool.shiftUnit(unitNamed(id), 50);
            return tool;
        };

        const shifted = SpaceTool.shiftedBy(before, [
            toolShifting("Sub_1", "Task_B"),
            toolShifting("Task_B", "Task_A"),
        ]);

        expect(shifted).toEqual(["Task_A", "Task_B", "Sub_1"]);
    });
});

describe("SpaceTool.unitsIn", () => {
    it("gives a pool the data stores and artifacts lying in it, which then give way with it", () => {
        const shapes = [
            pool("Pool_1", box(0, 0, 600, 300)),
            node("x", "Task_A", box(100, 100), { pool: "Pool_1" }),
            node("x", "Store_In", box(300, 100, 50, 50), {
                pool: "Pool_1",
                mayLieOutsidePool: true,
            }),
            node("x", "Note_In", box(400, 100)),
            node("x", "Store_Out", box(800, 100, 50, 50), {
                pool: "Pool_1",
                mayLieOutsidePool: true,
            }),
        ];
        const layout = layoutOf(shapes);
        const before = DrawingDraft.of(layout);
        const tool = new SpaceTool(before, before.fork(), new ShapeGroups(layout), "y");

        const units = tool.unitsIn(PLANE, undefined, new Set());

        expect(units.map(({ id, nodes }) => [id, nodes])).toEqual([
            ["Store_Out", ["Store_Out"]],
            ["Pool_1", ["Task_A", "Store_In", "Note_In"]],
        ]);
    });
});
