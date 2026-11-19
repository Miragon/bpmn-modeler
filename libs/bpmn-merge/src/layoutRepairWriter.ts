import { type ModdleElement, isModdleElement } from "@miragon/bpmn-modeler-diff";

import { type DiagramIndex, diagramIndexOf, flowDrawingOf } from "./diagramIndex";
import { type DiagramBounds, type Point, sameBounds } from "./layoutGeometry";
import type { LayoutEdge, LayoutModel } from "./layoutModel";
import { shapeDrawingOf } from "./layoutModelReader";

/**
 * Writes what the repaired layout changed against the layout read from the
 * definitions into the drawings `layoutModelOf` reads: a shape's bounds with
 * its label moved alongside, an edge's waypoints and label. Nothing else of
 * the drawing changes.
 */
export function writeLayoutChanges(
    definitions: ModdleElement,
    before: LayoutModel,
    after: LayoutModel,
    createPoint: (point: Point) => ModdleElement,
): void {
    if (before === after) return;
    let index: DiagramIndex | undefined;
    const indexed = () => (index ??= diagramIndexOf(definitions));
    for (const [id, shape] of after.shapes) {
        const old = before.shapes.get(id);
        if (old === undefined || old === shape || sameBounds(old.bounds, shape.bounds)) continue;
        const drawing = shapeDrawingOf(indexed().drawingsByElement.get(id) ?? [])?.element;
        if (drawing !== undefined) writeShape(drawing, old.bounds, shape.bounds);
    }
    for (const [id, edge] of after.edges) {
        const old = before.edges.get(id);
        if (old === undefined || old === edge) continue;
        const drawing = flowDrawingOf(indexed(), id)?.element;
        if (drawing !== undefined) writeEdge(drawing, old, edge, createPoint);
    }
}

function writeShape(drawing: ModdleElement, before: DiagramBounds, after: DiagramBounds): void {
    Object.assign(drawing.bounds as ModdleElement, after);
    const label = (drawing.label as ModdleElement | undefined)?.bounds;
    if (isModdleElement(label)) {
        label.x = Number(label.x) + after.x - before.x;
        label.y = Number(label.y) + after.y - before.y;
    }
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
    const label = (drawing.label as ModdleElement | undefined)?.bounds;
    const labelMoved =
        after.label !== undefined &&
        (before.label === undefined || !sameBounds(before.label, after.label));
    if (labelMoved && after.label !== undefined && isModdleElement(label)) {
        label.x = after.label.x;
        label.y = after.label.y;
    }
}

function samePoints(first: readonly Point[], second: readonly Point[]): boolean {
    return (
        first.length === second.length &&
        first.every((point, at) => point.x === second[at]!.x && point.y === second[at]!.y)
    );
}
