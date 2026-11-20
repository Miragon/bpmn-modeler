import {
    type DiagramBounds,
    type Outline,
    type Point,
    boundsAround,
    overlapsBeyondTolerance,
    translated,
} from "./layoutGeometry";
import type { PlaneSlot } from "./planeSlots";

interface DrawnShape {
    readonly id: string;
    /** The element whose plane draws the shape; "" for a plane that names none. */
    readonly plane: string;
    /** The result's slot for the shape's plane (`PlaneSlots`): two layouts draw a shape in one place only within one slot. */
    readonly slot: PlaneSlot;
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

export interface PoolShape extends DrawnShape {
    readonly kind: "pool";
}

/** A `bpmn:Group`: it holds no element, so nothing lies inside it by design and it is no frame. */
export interface GroupShape extends DrawnShape {
    readonly kind: "group";
    /** Where the group's name is drawn: bpmn-js draws it apart from the shape. */
    readonly label?: DiagramBounds;
}

export type LayoutShape = NodeShape | LaneShape | PoolShape | GroupShape;

export interface LayoutEdge {
    readonly id: string;
    readonly plane: string;
    readonly waypoints: readonly Point[];
    readonly source?: string;
    readonly target?: string;
    readonly kind: EdgeKind;
    /** Where the flow's name is drawn. */
    readonly label?: DiagramBounds;
}

export type EdgeKind = "sequenceFlow" | "messageFlow" | "association";

/** Whether the edge is a sequence flow, which orders the nodes it joins. */
export function carriesSequence(edge: LayoutEdge): boolean {
    return edge.kind === "sequenceFlow";
}

/** Whether the flows leave one shape or enter one, where flows join; an end drawn on no shape is shared with none. */
export function sharesAnEndWith(edge: LayoutEdge, other: LayoutEdge): boolean {
    return (
        (edge.source !== undefined && edge.source === other.source) ||
        (edge.target !== undefined && edge.target === other.target)
    );
}

export const FLOW_ENDS = ["source", "target"] as const;

export type FlowEnd = (typeof FLOW_ENDS)[number];

/** The shapes a flow's ends are drawn on. */
export interface FlowEnds {
    readonly source: LayoutShape;
    readonly target: LayoutShape;
}

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

/** The node's shape and, when drawn apart from it, its label. */
export function drawnPartsOf(node: NodeShape): DiagramBounds[] {
    return node.label === undefined ? [node.bounds] : [node.bounds, node.label];
}

/** Where the shape's name is drawn apart from it: only a node's or a group's is. */
export function labelOf(shape: LayoutShape): DiagramBounds | undefined {
    return shape.kind === "node" || shape.kind === "group" ? shape.label : undefined;
}

/** How far the shape reaches as drawn, its label with it. */
export function reachOf(shape: LayoutShape): DiagramBounds {
    const label = labelOf(shape);
    return label === undefined ? shape.bounds : boundsAround([shape.bounds, label]);
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

/** The shape of the flow's end on the flow's own plane; never a group, whose associations the repair leaves as drawn. */
export function endShapeOf(
    layout: LayoutModel,
    edge: LayoutEdge,
    end: FlowEnd,
): LayoutShape | undefined {
    const id = edge[end];
    const shape = id === undefined ? undefined : layout.shapes.get(id);
    return shape?.plane === edge.plane && shape.kind !== "group" ? shape : undefined;
}

/** The activity a boundary event sits on, as drawn on the event's own plane. */
export function drawnHostOf(layout: LayoutModel, node: NodeShape): NodeShape | undefined {
    const host = node.host === undefined ? undefined : nodeShapeIn(layout, node.host);
    return host?.plane === node.plane ? host : undefined;
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
    return shape.kind === "node" ? shape.expanded : shape.kind !== "group";
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
