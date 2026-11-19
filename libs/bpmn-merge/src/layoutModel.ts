import {
    type DiagramBounds,
    type Outline,
    type Point,
    overlapsBeyondTolerance,
    translated,
} from "./layoutGeometry";

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
    /** Where the element's name is drawn, when apart from its shape. */
    readonly label?: DiagramBounds;
}

export interface LaneShape extends DrawnShape {
    readonly kind: "lane";
    /** The lane or the process whose lane set holds the lane: lanes with one parent are stacked. */
    readonly parent: string;
    /** The pool drawing the lane's process. */
    readonly pool?: string;
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
    /** What the edge connects; the reader always names it, a spec may leave a sequence flow without. */
    readonly kind?: EdgeKind;
    /** Where the flow's name is drawn. */
    readonly label?: DiagramBounds;
}

export type EdgeKind = "sequenceFlow" | "messageFlow" | "association";

/** Whether the edge is a sequence flow, which orders the nodes it joins. */
export function carriesSequence(edge: LayoutEdge): boolean {
    return edge.kind === undefined || edge.kind === "sequenceFlow";
}

export const FLOW_ENDS = ["source", "target"] as const;

export type FlowEnd = (typeof FLOW_ENDS)[number];

export function otherEndOf(end: FlowEnd): FlowEnd {
    return end === "source" ? "target" : "source";
}

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

export function translatedNode(node: NodeShape, dx: number, dy: number): NodeShape {
    const moved = { ...node, bounds: translated(node.bounds, dx, dy) };
    return node.label === undefined ? moved : { ...moved, label: translated(node.label, dx, dy) };
}

export function translatedEdge(edge: LayoutEdge, dx: number, dy: number): LayoutEdge {
    const waypoints = edge.waypoints.map(({ x, y }) => ({ x: x + dx, y: y + dy }));
    const moved = { ...edge, waypoints };
    return edge.label === undefined ? moved : { ...moved, label: translated(edge.label, dx, dy) };
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

/** The activity a boundary event sits on, as drawn on the event's own plane. */
export function drawnHostOf(layout: LayoutModel, node: NodeShape): NodeShape | undefined {
    const host = node.host === undefined ? undefined : nodeShapeIn(layout, node.host);
    return host?.plane === node.plane ? host : undefined;
}

/** The pool drawn around the node on its plane; none for a data store's pool, as it may lie outside. */
export function drawnPoolOf(layout: LayoutModel, node: NodeShape): LayoutShape | undefined {
    if (node.pool === undefined || node.mayLieOutsidePool) return undefined;
    const pool = layout.shapes.get(node.pool);
    return isDrawnFrameOf(node, pool) ? pool : undefined;
}

/** The lanes of the pool's process drawn on its plane, wherever they lie, in document order. */
export function lanesOf(layout: LayoutModel, pool: LayoutShape): LaneShape[] {
    return [...layout.shapes.values()].filter(
        (shape): shape is LaneShape =>
            shape.kind === "lane" && shape.pool === pool.id && shape.plane === pool.plane,
    );
}

/** Whether the pool covers another pool on its plane by more than the tolerance. */
export function liesOnAnotherPool(layout: LayoutModel, pool: LayoutShape): boolean {
    return [...layout.shapes.values()].some(
        (shape) =>
            shape.kind === "pool" &&
            shape.id !== pool.id &&
            shape.plane === pool.plane &&
            overlapsBeyondTolerance(shape.bounds, pool.bounds),
    );
}

/** A shape others lie inside: a pool, a lane or a sub-process drawn open. */
export function isFrame(shape: LayoutShape): boolean {
    return shape.kind !== "node" || shape.expanded;
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
    return frameIdsOf(node).flatMap((id) => {
        const frame = layout.shapes.get(id);
        return isDrawnFrameOf(node, frame) ? [frame] : [];
    });
}

/** The frames the node must lie inside by its relations, drawn or not, as `framesOf` picks them. */
export function frameIdsOf(node: NodeShape): string[] {
    const subProcess = node.subProcesses[0];
    if (subProcess !== undefined) return [subProcess];
    if (node.mayLieOutsidePool) return [];
    return [...(node.pool === undefined ? [] : [node.pool]), ...node.lanes];
}

/**
 * The innermost drawn frame both ends of the flow lie in: an expanded
 * sub-process, else their pool. None for a flow between pools or to one.
 */
export function sharedFrameOf(layout: LayoutModel, edge: LayoutEdge): LayoutShape | undefined {
    const [source, target] = FLOW_ENDS.map((end) => {
        const shape = endShapeOf(layout, edge, end);
        return shape?.kind === "node" ? enclosingFramesOf(layout, shape) : [];
    });
    return source!.find((frame) => target!.includes(frame));
}

/** Every drawn frame around the node: its sub-processes drawn open, innermost first, then its pool and lanes. */
export function framesAroundOf(layout: LayoutModel, node: NodeShape): LayoutShape[] {
    const lanes = node.mayLieOutsidePool ? [] : node.lanes;
    return [
        ...enclosingFramesOf(layout, node),
        ...lanes.flatMap((id) => {
            const lane = layout.shapes.get(id);
            return isDrawnFrameOf(node, lane) ? [lane] : [];
        }),
    ];
}

/** The drawn frames around the node, innermost first. */
function enclosingFramesOf(layout: LayoutModel, node: NodeShape): LayoutShape[] {
    const pool = drawnPoolOf(layout, node);
    const subProcesses = node.subProcesses.flatMap((id) => {
        const frame = layout.shapes.get(id);
        return isDrawnFrameOf(node, frame) ? [frame] : [];
    });
    return pool === undefined ? subProcesses : [...subProcesses, pool];
}

function isDrawnFrameOf(node: NodeShape, frame: LayoutShape | undefined): frame is LayoutShape {
    return frame !== undefined && frame.plane === node.plane && isFrame(frame);
}
