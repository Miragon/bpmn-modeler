import { type ModdleElement, isModdleElement } from "@miragon/bpmn-modeler-diff/domain";

import type { DiagramIndex } from "../diagramIndex";
import { type DiagramBounds, type Point, sameBounds } from "./layoutGeometry";
import { type LayoutEdge, type LayoutModel, type LayoutShape, labelOf } from "./layoutModel";

/**
 * Writes what the repaired layout changed against the layout read through the
 * index into the drawings `layoutModelOfDocument` reads: a shape's bounds and
 * label, an edge's waypoints and label. Nothing else of the drawing changes.
 */
export function writeLayoutChanges(
    index: DiagramIndex,
    before: LayoutModel,
    after: LayoutModel,
    createPoint: (point: Point) => ModdleElement,
): void {
    if (before === after) return;
    for (const [id, shape] of after.shapes) {
        const old = before.shapes.get(id);
        if (old === undefined || old === shape || sameDrawing(old, shape)) continue;
        const drawing = index.shapeDrawingOf(id)?.element;
        if (drawing !== undefined) writeShape(drawing, old, shape);
    }
    for (const [id, edge] of after.edges) {
        const old = before.edges.get(id);
        if (old === undefined || old === edge) continue;
        const drawing = index.flowDrawingOf(id)?.element;
        if (drawing !== undefined) writeEdge(drawing, old, edge, createPoint);
    }
}

function sameDrawing(before: LayoutShape, after: LayoutShape): boolean {
    return sameBounds(before.bounds, after.bounds) && sameLabel(labelOf(before), labelOf(after));
}

function writeShape(drawing: ModdleElement, before: LayoutShape, after: LayoutShape): void {
    if (!sameBounds(before.bounds, after.bounds)) {
        Object.assign(drawing.bounds as ModdleElement, after.bounds);
    }
    writeLabel(drawing, labelOf(before), labelOf(after));
}

function writeEdge(
    drawing: ModdleElement,
    before: LayoutEdge,
    after: LayoutEdge,
    createPoint: (point: Point) => ModdleElement,
): void {
    if (!samePoints(before.waypoints, after.waypoints)) {
        drawing.waypoint = after.waypoints.map((point) => {
            const waypoint = createPoint(point);
            waypoint.$parent = drawing;
            return waypoint;
        });
    }
    writeLabel(drawing, before.label, after.label);
}

function writeLabel(
    drawing: ModdleElement,
    before: DiagramBounds | undefined,
    after: DiagramBounds | undefined,
): void {
    const label = (drawing.label as ModdleElement | undefined)?.bounds;
    if (after === undefined || sameLabel(before, after) || !isModdleElement(label)) return;
    label.x = after.x;
    label.y = after.y;
}

function sameLabel(first: DiagramBounds | undefined, second: DiagramBounds | undefined): boolean {
    return first === undefined || second === undefined
        ? first === second
        : sameBounds(first, second);
}

function samePoints(first: readonly Point[], second: readonly Point[]): boolean {
    return (
        first.length === second.length &&
        first.every((point, at) => point.x === second[at]!.x && point.y === second[at]!.y)
    );
}
