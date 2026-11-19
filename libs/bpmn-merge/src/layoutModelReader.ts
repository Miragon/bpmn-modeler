import {
    type ModdleElement,
    isModdleElement,
    isType,
    moddleElements,
} from "@miragon/bpmn-modeler-diff";

import {
    type DiagramIndex,
    type Drawing,
    diagramIndexOf,
    flowDrawingOf,
    planeKindOf,
    rootPlaneProcessesOf,
} from "./diagramIndex";
import type { DiagramBounds, Outline, Point } from "./layoutGeometry";
import type { LayoutEdge, LayoutModel, LayoutShape } from "./layoutModel";
import { type LayoutRelations, layoutRelationsOf } from "./layoutRelations";

type ShapePlane = Pick<LayoutShape, "plane" | "planeKind" | "planeProcesses">;

/** The document's drawing as plain values; numbers are copied, so later changes to the tree do not reach it. */
export function layoutModelOf(definitions: ModdleElement): LayoutModel {
    const relations = layoutRelationsOf(definitions);
    const index = diagramIndexOf(definitions);
    const shapes = new Map<string, LayoutShape>();
    const edges = new Map<string, LayoutEdge>();
    for (const [id, drawings] of index.drawingsByElement) {
        const connection = relations.connections.get(id);
        const flowDrawing = connection === undefined ? undefined : flowDrawingOf(index, id);
        if (connection !== undefined && flowDrawing !== undefined) {
            const { element, planeOwner: plane } = flowDrawing;
            const label = labelBoundsOf(element);
            const edge = { id, plane, waypoints: waypointsOf(element), ...connection };
            edges.set(id, label === undefined ? edge : { ...edge, label });
            continue;
        }
        const drawing = shapeDrawingOf(drawings);
        const shape = drawing && shapeOf(relations, id, planeOf(index, drawing), drawing.element);
        if (shape !== undefined) shapes.set(id, shape);
    }
    return { shapes, edges };
}

function planeOf(index: DiagramIndex, { planeOwner }: Drawing): ShapePlane {
    return {
        plane: planeOwner,
        planeKind: planeKindOf(planeOwner, index),
        planeProcesses: rootPlaneProcessesOf(index, planeOwner),
    };
}

/** The element's shape drawing the layout reads: the first with bounds. */
export function shapeDrawingOf(drawings: readonly Drawing[]): Drawing | undefined {
    return drawings.find(
        ({ element }) => isType(element, "bpmndi:BPMNShape") && isModdleElement(element.bounds),
    );
}

function shapeOf(
    relations: LayoutRelations,
    id: string,
    plane: ShapePlane,
    drawing: ModdleElement,
): LayoutShape | undefined {
    const drawn = { id, ...plane, bounds: boundsOf(drawing.bounds as ModdleElement) };
    const rectangle: Outline = "rectangle";
    if (relations.pools.has(id)) return { ...drawn, kind: "pool", outline: rectangle };
    const laneParent = relations.laneParents.get(id);
    if (laneParent !== undefined) {
        const lane = { ...drawn, kind: "lane", outline: rectangle, parent: laneParent } as const;
        const pool = relations.lanePools.get(id);
        return pool === undefined ? lane : { ...lane, pool };
    }
    const node = relations.nodes.get(id);
    if (node === undefined) return undefined;
    const label = labelBoundsOf(drawing);
    const shape = {
        ...drawn,
        ...node,
        kind: "node",
        expanded: drawing.isExpanded === true,
        lanes: relations.lanesByNode.get(id) ?? [],
    } as const;
    return label === undefined ? shape : { ...shape, label };
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
