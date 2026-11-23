import { type Axis, across, along, crossAxisOf, farSideOf, nearSideOf } from "./layoutAxis";
import { DrawingDraft } from "./layoutDrawingDraft";
import { type DiagramBounds, type Offset, centerOf } from "./layoutGeometry";
import {
    FLOW_ENDS,
    type LayoutEdge,
    type LayoutModel,
    type NodeShape,
    inSameContainer,
    nodeShapeIn,
    translatedEdge,
} from "./layoutModel";
import { ShapeGroups } from "./layoutShapeGroups";
import { drawnByOneSideOnly, drawsAt } from "./sideDrawings";

/** A shape only one side draws, still where that side drew it, with its neighbours there. */
interface OneSidedShape {
    readonly node: NodeShape;
    readonly side: LayoutModel;
    readonly neighbours: readonly Neighbour[];
}

/** A flow neighbour of a one-sided shape as its side draws it. */
interface Neighbour {
    readonly id: string;
    /** The neighbour comes before the shape along the flow. */
    readonly before: boolean;
    /** A sequence flow joins them, not an association. */
    readonly inSequence: boolean;
}

/**
 * Keeps each shape only one side draws beside the flow neighbour that side
 * drew it at: where the result draws the neighbour elsewhere, the shape moves
 * by as much with its boundary events and contents. The neighbours are read
 * from the side's flows, so a flow the result dropped still counts: sequence
 * flows before associations, predecessors first. The first of them on the
 * shape's plane and in its sub-process and lanes places it: one both sides
 * draw, or one the side added with the shape, which the shape then follows,
 * so a chain of added shapes stays as its side drew it behind its first one.
 * Added shapes that lead only to each other follow the first neighbour both
 * sides draw. The shape keeps its gap to the border of the neighbour it
 * faces and its offset from the neighbour's middle across the flow, and a
 * flow between shapes that move alike moves with them.
 */
export function placeBesideNeighbours(
    layout: LayoutModel,
    sides: readonly LayoutModel[],
): LayoutModel {
    return translatedBy(layout, NeighbourOffsets.of(layout, sides));
}

/** How far each shape only one side draws moves to stay beside its neighbours, found shape by shape. */
class NeighbourOffsets {
    private readonly offsets = new Map<string, Offset>();
    private readonly added: ReadonlyMap<string, OneSidedShape>;

    private constructor(
        private readonly layout: LayoutModel,
        private readonly sides: readonly LayoutModel[],
        private readonly shapes: readonly OneSidedShape[],
    ) {
        this.added = new Map(shapes.map((shape) => [shape.node.id, shape]));
    }

    static of(layout: LayoutModel, sides: readonly LayoutModel[]): ReadonlyMap<string, Offset> {
        const found = new NeighbourOffsets(layout, sides, oneSidedShapesOf(layout, sides));
        found.placeWhilePossible((shape) => found.besideFirstNeighbour(shape));
        // What is left waits for added shapes that wait for it in turn.
        found.placeWhilePossible((shape) =>
            firstDefined(shape.neighbours, ({ id }) => found.besideKept(shape, id)),
        );
        found.placeWhilePossible((shape) =>
            firstDefined(shape.neighbours, ({ id }) => found.behindAdded(shape, id)),
        );
        return found.offsets;
    }

    private placeWhilePossible(offsetOf: (shape: OneSidedShape) => Offset | undefined): void {
        for (let progressed = true; progressed;) {
            progressed = false;
            for (const shape of this.shapes) {
                const offset = this.offsets.has(shape.node.id) ? undefined : offsetOf(shape);
                if (offset === undefined) continue;
                this.offsets.set(shape.node.id, offset);
                progressed = true;
            }
        }
    }

    /** The offset the shape's first neighbour gives it; undefined while that one is an added shape not placed yet. */
    private besideFirstNeighbour(shape: OneSidedShape): Offset | undefined {
        for (const { id } of shape.neighbours) {
            const offset = this.besideKept(shape, id);
            if (offset !== undefined) return offset;
            if (this.addedWith(shape, id)) return this.offsets.get(id);
        }
        return undefined;
    }

    /** The offset of a shape the side added with the shape, once that one is placed. */
    private behindAdded(shape: OneSidedShape, id: string): Offset | undefined {
        return this.addedWith(shape, id) ? this.offsets.get(id) : undefined;
    }

    private addedWith(shape: OneSidedShape, id: string): boolean {
        const neighbour = this.added.get(id);
        return neighbour !== undefined && inSameContainer(neighbour.node, shape.node);
    }

    /**
     * How far the result draws the neighbour from where the shape's side
     * draws it, along the flow by the border the shape faces and across it
     * by the middle; undefined unless both sides draw the neighbour in the
     * shape's container.
     */
    private besideKept(shape: OneSidedShape, id: string): Offset | undefined {
        if (!this.sides.every((side) => side.shapes.has(id))) return undefined;
        const here = nodeShapeIn(this.layout, id);
        const there = nodeShapeIn(shape.side, id);
        if (here === undefined || there === undefined) return undefined;
        if (!inSameContainer(here, shape.node) || !inSameContainer(there, shape.node)) {
            return undefined;
        }
        const axis = flowAxisOf(shape.node.bounds, there.bounds);
        const liesAfter =
            along(axis, centerOf(shape.node.bounds)) > along(axis, centerOf(there.bounds));
        const facing = liesAfter ? farSideOf : nearSideOf;
        const byAlong = facing(axis, here.bounds) - facing(axis, there.bounds);
        const byAcross = across(axis, centerOf(here.bounds)) - across(axis, centerOf(there.bounds));
        return axis === "x" ? { dx: byAlong, dy: byAcross } : { dx: byAcross, dy: byAlong };
    }
}

function firstDefined<Item, Value>(
    items: readonly Item[],
    valueOf: (item: Item) => Value | undefined,
): Value | undefined {
    for (const item of items) {
        const value = valueOf(item);
        if (value !== undefined) return value;
    }
    return undefined;
}

function oneSidedShapesOf(layout: LayoutModel, sides: readonly LayoutModel[]): OneSidedShape[] {
    return [...layout.shapes.values()].flatMap((shape): OneSidedShape[] => {
        if (shape.kind !== "node" || shape.host !== undefined) return [];
        if (!drawnByOneSideOnly(shape.id, sides)) return [];
        const side = sides.find((drawing) => drawing.shapes.has(shape.id))!;
        return drawsAt(side, shape)
            ? [{ node: shape, side, neighbours: neighboursOf(shape, side) }]
            : [];
    });
}

/** The shape's neighbours along the flows its side draws: sequence before association, predecessors first, in the side's order. */
function neighboursOf(node: NodeShape, side: LayoutModel): Neighbour[] {
    const neighbours = [...side.edges.values()].flatMap((edge): Neighbour[] => {
        if (!ordersNeighbours(edge)) return [];
        const inSequence = edge.kind === "sequenceFlow";
        if (edge.target === node.id && edge.source !== undefined) {
            return [{ id: edge.source, before: true, inSequence }];
        }
        if (edge.source === node.id && edge.target !== undefined) {
            return [{ id: edge.target, before: false, inSequence }];
        }
        return [];
    });
    const rank = ({ before, inSequence }: Neighbour) => (inSequence ? 0 : 2) + (before ? 0 : 1);
    return [...neighbours].sort((first, second) => rank(first) - rank(second));
}

/** A message flow joins two pools, which are placed by rules of their own. */
function ordersNeighbours(edge: LayoutEdge): boolean {
    return edge.kind !== "messageFlow";
}

/** The axis the two shapes lie apart along, as the side drew them: beside each other where they overlap across it, else where their middles lie farther apart. */
function flowAxisOf(shape: DiagramBounds, neighbour: DiagramBounds): Axis {
    const besideAlongX = overlapAcross("x", shape, neighbour);
    if (besideAlongX !== overlapAcross("y", shape, neighbour)) return besideAlongX ? "x" : "y";
    const [from, to] = [centerOf(shape), centerOf(neighbour)];
    return Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? "x" : "y";
}

function overlapAcross(axis: Axis, first: DiagramBounds, second: DiagramBounds): boolean {
    const crossAxis = crossAxisOf(axis);
    return (
        nearSideOf(crossAxis, first) < farSideOf(crossAxis, second) &&
        nearSideOf(crossAxis, second) < farSideOf(crossAxis, first)
    );
}

/** Moves each shape with what it carries, and each flow between shapes that move alike with them. */
function translatedBy(layout: LayoutModel, offsets: ReadonlyMap<string, Offset>): LayoutModel {
    const draft = DrawingDraft.of(layout);
    const groups = new ShapeGroups(layout);
    const movedBy = new Map<string, Offset>();
    const attached = new Set<string>();
    for (const [id, offset] of offsets) {
        if (offset.dx === 0 && offset.dy === 0) continue;
        const group = groups.of(draft, draft.node(id)!);
        draft.translate(group, offset.dx, offset.dy);
        for (const member of group.members) movedBy.set(member, offset);
        for (const edge of group.attachedEdges) attached.add(edge);
    }
    for (const id of attached) {
        const edge = draft.edges.get(id)!;
        const [source, target] = FLOW_ENDS.map((end) => movedBy.get(edge[end] ?? ""));
        if (source !== undefined && source.dx === target?.dx && source.dy === target.dy) {
            draft.replaceEdge(translatedEdge(edge, source.dx, source.dy));
        }
    }
    return draft.changedOrOriginal;
}
