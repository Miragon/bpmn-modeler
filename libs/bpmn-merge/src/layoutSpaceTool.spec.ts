import { describe, expect, it } from "vitest";

import { rootPlane } from "./__fixtures__/shapePlane";
import type { Axis } from "./layoutAxis";
import { DrawingDraft } from "./layoutDrawingDraft";
import type { DiagramBounds, Point } from "./layoutGeometry";
import type { LayoutEdge, LayoutModel, LayoutShape, NodeShape } from "./layoutModel";
import { ShapeGroups } from "./layoutShapeGroups";
import { SpaceTool } from "./layoutSpaceTool";

const PLANE = "Process_1";

/** Along y the drawing is the one along x mirrored at its diagonal. */
const oriented = (axis: Axis, { x, y, width, height }: DiagramBounds): DiagramBounds =>
    axis === "x" ? { x, y, width, height } : { x: y, y: x, width: height, height: width };

const point = (axis: Axis, x: number, y: number): Point =>
    axis === "x" ? { x, y } : { x: y, y: x };

const box = (x: number, y: number, width = 100, height = 80): DiagramBounds => ({
    x,
    y,
    width,
    height,
});

function node(
    axis: Axis,
    id: string,
    bounds: DiagramBounds,
    relations: Partial<NodeShape> = {},
): NodeShape {
    return {
        kind: "node",
        id,
        ...rootPlane(PLANE),
        bounds: oriented(axis, bounds),
        outline: "rectangle",
        expanded: false,
        subProcesses: [],
        lanes: [],
        mayLieOutsidePool: false,
        ...relations,
    };
}

function frame(axis: Axis, id: string, bounds: DiagramBounds): LayoutShape {
    return {
        kind: "lane",
        id,
        ...rootPlane(PLANE),
        outline: "rectangle",
        parent: PLANE,
        bounds: oriented(axis, bounds),
    };
}

/**
 * Along x: Task_A before the line at 340, Task_B past it by its center with
 * a boundary event whose own center lies before it, a sub-process across
 * the line by its near side with a content past it, a frame the band opens
 * in and a frame past the line.
 */
function drawingAlong(axis: Axis): LayoutModel {
    const shapes: LayoutShape[] = [
        frame(axis, "Frame_Open", box(0, 0, 1000, 600)),
        frame(axis, "Frame_Past", box(1100, 0, 200, 600)),
        node(axis, "Task_A", box(100, 100)),
        node(axis, "Task_B", box(300, 100)),
        node(axis, "Event_B", box(282, 162, 36, 36), { host: "Task_B" }),
        node(axis, "Sub_1", box(320, 300, 300, 200), { expanded: true }),
        node(axis, "Task_S", box(400, 360), { subProcesses: ["Sub_1"] }),
    ];
    const edges: LayoutEdge[] = [
        {
            id: "Flow_1",
            plane: PLANE,
            kind: "sequenceFlow",
            source: "Task_A",
            target: "Task_B",
            waypoints: [point(axis, 200, 140), point(axis, 300, 140)],
        },
    ];
    return {
        shapes: new Map(shapes.map((shape) => [shape.id, shape])),
        edges: new Map(edges.map((edge) => [edge.id, edge])),
    };
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
            units: tool.unitsIn(PLANE, undefined, new Set()),
            frames,
            growing: new Set(["Frame_Open"]),
        });
        tool.stretchEdges(PLANE, new Set(), 340);

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
        expect(tool.shifted).toEqual(["Task_B"]);
        expect(tool.moved).toEqual(["Task_B", "Event_B", "Frame_Past"]);
    });

    it("shifts a unit that already gave way no further", () => {
        const layout = drawingAlong("x");
        const before = DrawingDraft.of(layout);
        const trial = before.fork();
        const tool = new SpaceTool(before, trial, new ShapeGroups(layout), "x");
        const units = tool.unitsIn(PLANE, undefined, new Set());
        tool.shiftUnit(
            units.find(({ id }) => id === "Task_B")!,
            50,
        );

        tool.openBand({ line: 340, by: 100, units, frames: [], growing: new Set() });

        expect(trial.shapes.get("Task_B")!.bounds).toEqual(box(350, 100));
    });
});
