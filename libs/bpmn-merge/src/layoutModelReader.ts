import {
    type ModdleElement,
    isModdleElement,
    isType,
    moddleElements,
} from "@miragon/bpmn-modeler-diff";

import { diagramIndexOf, flowDrawingOf } from "./diagramIndex";
import type { DiagramBounds, Outline, Point } from "./layoutGeometry";
import type { LayoutEdge, LayoutModel, LayoutShape } from "./layoutModel";
import { type LayoutRelations, layoutRelationsOf } from "./layoutRelations";

/** The document's drawing as plain values; numbers are copied, so later changes to the tree do not reach it. */
export function layoutModelOf(definitions: ModdleElement): LayoutModel {
    const relations = layoutRelationsOf(definitions);
    const index = diagramIndexOf(definitions);
    const shapes = new Map<string, LayoutShape>();
    const edges = new Map<string, LayoutEdge>();
    for (const [id, drawings] of index.drawingsByElement) {
        const ends = relations.connections.get(id);
        const flowDrawing = ends === undefined ? undefined : flowDrawingOf(index, id);
        if (ends !== undefined && flowDrawing !== undefined) {
            const { element, planeOwner: plane } = flowDrawing;
            const label = labelBoundsOf(element);
            const edge = { id, plane, waypoints: waypointsOf(element), ...ends };
            edges.set(id, label === undefined ? edge : { ...edge, label });
            continue;
        }
        const shape = drawings
            .filter(({ element }) => isType(element, "bpmndi:BPMNShape"))
            .map(({ element, planeOwner }) => shapeOf(relations, id, planeOwner, element))
            .find((drawn) => drawn !== undefined);
        if (shape !== undefined) shapes.set(id, shape);
    }
    return { shapes, edges };
}

function shapeOf(
    relations: LayoutRelations,
    id: string,
    plane: string,
    drawing: ModdleElement,
): LayoutShape | undefined {
    if (!isModdleElement(drawing.bounds)) return undefined;
    const drawn = { id, plane, bounds: boundsOf(drawing.bounds) };
    const rectangle: Outline = "rectangle";
    if (relations.pools.has(id)) return { ...drawn, kind: "pool", outline: rectangle };
    const laneParent = relations.laneParents.get(id);
    if (laneParent !== undefined) {
        return { ...drawn, kind: "lane", outline: rectangle, parent: laneParent };
    }
    const node = relations.nodes.get(id);
    if (node === undefined) return undefined;
    return {
        ...drawn,
        ...node,
        kind: "node",
        expanded: drawing.isExpanded === true,
        lanes: relations.lanesByNode.get(id) ?? [],
    };
}

function boundsOf(bounds: ModdleElement): DiagramBounds {
    return {
        x: Number(bounds.x),
        y: Number(bounds.y),
        width: Number(bounds.width),
        height: Number(bounds.height),
    };
}

function labelBoundsOf(drawing: ModdleElement): DiagramBounds | undefined {
    const label = drawing.label as ModdleElement | undefined;
    return isModdleElement(label?.bounds) ? boundsOf(label.bounds) : undefined;
}

function waypointsOf(drawing: ModdleElement): Point[] {
    return moddleElements(drawing.waypoint).map(({ x, y }) => ({ x: Number(x), y: Number(y) }));
}
