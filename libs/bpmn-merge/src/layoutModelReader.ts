import {
    type ModdleElement,
    idOf,
    isModdleElement,
    isType,
    moddleElements,
} from "@miragon/bpmn-modeler-diff";

import { planeOwnerOf } from "./diagramIndex";
import type { Outline, Point } from "./layoutGeometry";
import type { LayoutEdge, LayoutModel, LayoutShape } from "./layoutModel";
import { type LayoutRelations, layoutRelationsOf } from "./layoutRelations";

/** The document's drawing as plain values; numbers are copied, so later changes to the tree do not reach it. */
export function layoutModelOf(definitions: ModdleElement): LayoutModel {
    const relations = layoutRelationsOf(definitions);
    const shapes = new Map<string, LayoutShape>();
    const edges = new Map<string, LayoutEdge>();
    for (const diagram of moddleElements(definitions.diagrams)) {
        const plane = planeOwnerOf(diagram);
        const drawings = (diagram.plane as ModdleElement | undefined)?.planeElement;
        for (const drawing of moddleElements(drawings)) {
            const id = idOf(drawing.bpmnElement);
            if (id === undefined || shapes.has(id) || edges.has(id)) continue;
            if (isType(drawing, "bpmndi:BPMNShape")) {
                const shape = shapeOf(relations, id, plane, drawing);
                if (shape !== undefined) shapes.set(id, shape);
            } else if (isType(drawing, "bpmndi:BPMNEdge")) {
                const ends = relations.connections.get(id);
                if (ends !== undefined) {
                    edges.set(id, { id, plane, waypoints: waypointsOf(drawing), ...ends });
                }
            }
        }
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

function boundsOf(bounds: ModdleElement) {
    return {
        x: Number(bounds.x),
        y: Number(bounds.y),
        width: Number(bounds.width),
        height: Number(bounds.height),
    };
}

function waypointsOf(drawing: ModdleElement): Point[] {
    return moddleElements(drawing.waypoint).map(({ x, y }) => ({ x: Number(x), y: Number(y) }));
}
