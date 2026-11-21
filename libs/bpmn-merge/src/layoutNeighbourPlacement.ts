import { type Axis, across, along, crossAxisOf, farSideOf, nearSideOf } from "./layoutAxis";
import { DrawingDraft } from "./layoutDrawingDraft";
import { type DiagramBounds, type Offset, centerOf } from "./layoutGeometry";
import { type LayoutEdge, type LayoutModel, type NodeShape, nodeShapeIn } from "./layoutModel";
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
 * by as much with its boundary events and contents. The neighbour is one both
 * sides draw on the shape's plane and in its sub-process and lanes, read from
 * the side's flows, so a flow the result dropped still counts: sequence flows
 * before associations, predecessors first. A shape without such a neighbour
 * follows the first of its neighbours placed so. The shape keeps its gap to
 * the border of the neighbour it faces and its offset from the neighbour's
 * middle across the flow.
 */
export function placeBesideNeighbours(
    layout: LayoutModel,
    sides: readonly LayoutModel[],
): LayoutModel {
    const drawnByAll = (id: string) => sides.every((side) => side.shapes.has(id));
    const shapes = oneSidedShapesOf(layout, sides);
    const offsets = new Map<string, Offset>();
    for (const shape of shapes) {
        const offset = offsetBesideKept(layout, shape, drawnByAll);
        if (offset !== undefined) offsets.set(shape.node.id, offset);
    }
    let progressed = true;
    while (progressed) {
        progressed = false;
        for (const shape of shapes) {
            if (offsets.has(shape.node.id)) continue;
            const placed = shape.neighbours.find(({ id }) => {
                const neighbour = nodeShapeIn(layout, id);
                return offsets.has(id) && inSameContainer(neighbour!, shape.node);
            });
            if (placed === undefined) continue;
            offsets.set(shape.node.id, offsets.get(placed.id)!);
            progressed = true;
        }
    }
    return translatedBy(layout, offsets);
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

/** How far the first neighbour both sides draw lies in the result from where the shape's side draws it. */
function offsetBesideKept(
    layout: LayoutModel,
    shape: OneSidedShape,
    drawnByAll: (id: string) => boolean,
): Offset | undefined {
    for (const { id } of shape.neighbours) {
        if (!drawnByAll(id)) continue;
        const here = nodeShapeIn(layout, id);
        const there = nodeShapeIn(shape.side, id);
        if (here === undefined || there === undefined) continue;
        if (!inSameContainer(here, shape.node) || !inSameContainer(there, shape.node)) continue;
        const axis = flowAxisOf(shape.node.bounds, there.bounds);
        const liesAfter =
            along(axis, centerOf(shape.node.bounds)) > along(axis, centerOf(there.bounds));
        const facing = liesAfter ? farSideOf : nearSideOf;
        const byAlong = facing(axis, here.bounds) - facing(axis, there.bounds);
        const byAcross = across(axis, centerOf(here.bounds)) - across(axis, centerOf(there.bounds));
        return axis === "x" ? { dx: byAlong, dy: byAcross } : { dx: byAcross, dy: byAlong };
    }
    return undefined;
}

/** A neighbour in another sub-process or lane goes where that container takes it, not beside the shape. */
function inSameContainer(neighbour: NodeShape, shape: NodeShape): boolean {
    return (
        neighbour.slot.equals(shape.slot) &&
        neighbour.subProcesses[0] === shape.subProcesses[0] &&
        neighbour.lanes.join(" ") === shape.lanes.join(" ")
    );
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

function translatedBy(layout: LayoutModel, offsets: ReadonlyMap<string, Offset>): LayoutModel {
    const draft = DrawingDraft.of(layout);
    const groups = new ShapeGroups(layout);
    for (const [id, { dx, dy }] of offsets) {
        if (dx === 0 && dy === 0) continue;
        draft.translate(groups.of(draft, draft.node(id)!), dx, dy);
    }
    return draft.changedOrOriginal;
}
