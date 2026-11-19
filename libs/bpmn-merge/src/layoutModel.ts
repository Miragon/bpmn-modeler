import type { DiagramBounds, Outline, Point } from "./layoutGeometry";

interface DrawnShape {
    readonly id: string;
    /** The element whose plane draws the shape; "" for a plane that names none. */
    readonly plane: string;
    readonly bounds: DiagramBounds;
    readonly outline: Outline;
}

/** A flow node, data reference or annotation: anything drawn as a shape but a pool, a lane or a group. */
export interface NodeShape extends DrawnShape {
    readonly kind: "node";
    /** A sub-process drawn open, its contents inside its shape. */
    readonly expanded: boolean;
    /** The sub-processes holding the element, innermost first. */
    readonly subProcesses: readonly string[];
    /** The pool drawing the element's process. */
    readonly pool?: string;
    readonly lanes: readonly string[];
    /** The activity a boundary event is attached to. */
    readonly host?: string;
    /** bpmn-js lets a data store lie outside its process's pool and lanes. */
    readonly mayLieOutsidePool: boolean;
}

export interface LaneShape extends DrawnShape {
    readonly kind: "lane";
    /** The lane or the process whose lane set holds the lane: lanes with one parent are stacked. */
    readonly parent: string;
}

interface PoolShape extends DrawnShape {
    readonly kind: "pool";
}

export type LayoutShape = NodeShape | LaneShape | PoolShape;

export interface LayoutEdge {
    readonly id: string;
    readonly plane: string;
    readonly waypoints: readonly Point[];
    readonly source?: string;
    readonly target?: string;
    /** Where the flow's name is drawn. */
    readonly label?: DiagramBounds;
}

export const FLOW_ENDS = ["source", "target"] as const;

export type FlowEnd = (typeof FLOW_ENDS)[number];

/** One document's drawing as plain values: each element's shape or edge with what decides where it may lie. */
export interface LayoutModel {
    /** In document order. */
    readonly shapes: ReadonlyMap<string, LayoutShape>;
    readonly edges: ReadonlyMap<string, LayoutEdge>;
}

export function nodeShapeIn(layout: LayoutModel, id: string): NodeShape | undefined {
    const shape = layout.shapes.get(id);
    return shape?.kind === "node" ? shape : undefined;
}

/** The shape of the flow's end on the flow's own plane. */
export function endShapeOf(
    layout: LayoutModel,
    edge: LayoutEdge,
    end: FlowEnd,
): LayoutShape | undefined {
    const id = edge[end];
    const shape = id === undefined ? undefined : layout.shapes.get(id);
    return shape?.plane === edge.plane ? shape : undefined;
}

/** Whether one shape encloses the other or one is attached to the other: they lie on each other by design. */
export function belongTogether(first: NodeShape, second: NodeShape): boolean {
    return (
        first.subProcesses.includes(second.id) ||
        second.subProcesses.includes(first.id) ||
        first.host === second.id ||
        second.host === first.id
    );
}

/**
 * The drawn frames on the node's plane that the node must lie inside: its
 * sub-process when it has one, which stands for its contents in the pool and
 * lanes, otherwise its pool and lanes.
 */
export function framesOf(layout: LayoutModel, node: NodeShape): LayoutShape[] {
    const subProcess = node.subProcesses[0];
    const candidates =
        subProcess !== undefined
            ? [subProcess]
            : node.mayLieOutsidePool
              ? []
              : [...(node.pool === undefined ? [] : [node.pool]), ...node.lanes];
    return candidates.flatMap((id) => {
        const frame = layout.shapes.get(id);
        const draws = frame !== undefined && frame.plane === node.plane;
        return draws && (frame.kind !== "node" || frame.expanded) ? [frame] : [];
    });
}
