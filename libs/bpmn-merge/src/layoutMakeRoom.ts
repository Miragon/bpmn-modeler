import type { DrawingDraft } from "./layoutDrawingDraft";
import type { FlowRelation, FlowTopology } from "./layoutFlowTopology";
import { type DiagramBounds, bottomOf, boundsAround, centerOf, rightOf } from "./layoutGeometry";
import { type LayoutModel, type NodeShape, isFrame, liesOnAnotherPool } from "./layoutModel";
import {
    type Axis,
    ROOM_GAP,
    RoomPush,
    type RoomRequest,
    STACK_GAP,
    leadAlong,
} from "./layoutRoomPush";
import { type ShapeGroup, type ShapeGroups, groupBoundsIn } from "./layoutShapeGroups";
import type { Offset } from "./layoutShapePlacement";
import { introducedLayoutSpots } from "./layoutSpotDetection";
import { isFlowSpot, shapesOverlap } from "./layoutSpots";

export interface RoomMade {
    readonly draft: DrawingDraft;
    /** The outermost shapes that shifted to make room, in document order; none when the slot was free. */
    readonly shifted: readonly string[];
    /** The frames that grew to hold the group, in document order. */
    readonly grown: readonly string[];
    /** How far the frames grew in all, across both axes. */
    readonly growth: number;
}

/** What making room reads beside the drawing: what moves with a node and how the flows join the nodes. */
export interface RoomContext {
    readonly groups: ShapeGroups;
    readonly topology: FlowTopology;
}

/**
 * Where the moved group goes against the shape it lay on: in line after it,
 * stacked below it in its column, or in line before it with the other shape
 * pushed on.
 */
export type RoomSlot = "after" | "below" | "before";

/** The slot in line that a modeller draws a shape in that stands so to the other: before the shape it leads into, else after. */
export function inLineSlotFor(relation: FlowRelation): RoomSlot {
    return relation === "precedes" ? "before" : "after";
}

/** How far the group moves to lie in the slot against the other shape. */
export function slotOffsetOf(
    layout: LayoutModel,
    group: ShapeGroup,
    other: NodeShape,
    slot: RoomSlot,
): Offset {
    const { node } = group;
    switch (slot) {
        case "after":
            return { dx: rightOf(other.bounds) + ROOM_GAP - node.bounds.x, dy: 0 };
        case "below":
            return {
                dx: centerOf(other.bounds).x - centerOf(node.bounds).x,
                dy: bottomOf(withLabelOf(other)) + STACK_GAP - groupBoundsIn(layout, group).y,
            };
        case "before":
            return {
                dx: Math.min(0, other.bounds.x - node.bounds.x),
                dy: centerOf(other.bounds).y - centerOf(node.bounds).y,
            };
    }
}

/**
 * Makes room for the group in the slot against the shape it lies on, as the
 * modeler's space tool would held over just what is in the way: what the
 * group lands on gives way along the flow, or downward for a stacked branch,
 * with what that lands on; the frames that no longer hold it grow, and the
 * flows between shifted and staying shapes stretch. A stacked branch and the
 * shape above it then stay clear of what lies right of them. Undefined when
 * the other shape would have to give way in the slot after or below it, or
 * the room breaks the drawing anywhere else: a shape on another, outside its
 * frame, off its host, or a pool on another pool.
 */
export function makeRoom(
    draft: DrawingDraft,
    context: RoomContext,
    group: ShapeGroup,
    other: NodeShape,
    slot: RoomSlot = "after",
): RoomMade | undefined {
    const { node } = group;
    const { dx, dy } = slotOffsetOf(draft, group, other, slot);
    let trial = draft.fork();
    trial.translate(group, dx, dy);
    const box = groupBoundsIn(trial, group);
    const exclude = new Set(group.members);
    const stays = new Set([other.id]);
    const push = (axis: Axis, request: RoomRequest) =>
        pushIn(context, draft, trial, axis, group, node.id, request);
    const first =
        slot === "before"
            ? push("x", { box, line: box.x, exclude })
            : slot === "after"
              ? push("x", {
                    box,
                    line: rightOf(other.bounds) + 1,
                    floor: leadAlong("x", other),
                    exclude,
                    stays,
                })
              : push("y", { box, line: bottomOf(withLabelOf(other)) + 1, exclude, stays });
    if (first === undefined) return undefined;
    const pushes = [first];
    if (slot === "below") {
        const column = trial.fork();
        const clear = pushIn(context, trial, column, "x", group, other.id, {
            box: boundsAround([box, withLabelOf(other)]),
            newPart: box,
            line: rightOf(other.bounds) + 1,
            floor: leadAlong("x", other),
            exclude,
            stays,
        });
        if (clear !== undefined) {
            pushes.push(clear);
            trial = column;
        }
    }
    if (
        !breaksNothing(draft, trial) ||
        shapesOverlap(trial.node(node.id)!, trial.node(other.id)!)
    ) {
        return undefined;
    }
    const shiftedIds = new Set(pushes.flatMap(({ shifted }) => shifted));
    const grown = grownFrames(draft, trial);
    return {
        draft: trial,
        shifted: [...draft.shapes.keys()].filter((id) => shiftedIds.has(id)),
        grown: grown.map(({ id }) => id),
        growth: grown.reduce((sum, { by }) => sum + by, 0),
    };
}

/**
 * Pushes what is in the way in the frame the shape lies in and stretches the
 * flows between shifted and staying shapes; undefined when what is in the way
 * may not give way.
 */
function pushIn(
    context: RoomContext,
    before: DrawingDraft,
    trial: DrawingDraft,
    axis: Axis,
    group: ShapeGroup,
    at: string,
    request: RoomRequest,
): RoomPush | undefined {
    const push = new RoomPush(before, trial, context.groups, context.topology, axis);
    const shape = trial.node(at)!;
    if (!push.push(shape, request)) return undefined;
    push.stretchEdges(shape.plane, ownEdgesOf(group));
    return push;
}

/** The shape's bounds with its label's. */
function withLabelOf(node: NodeShape): DiagramBounds {
    return node.label === undefined ? node.bounds : boundsAround([node.bounds, node.label]);
}

/** The group's own edges, which move with it or which the flow repair re-routes. */
export function ownEdgesOf(group: ShapeGroup): ReadonlySet<string> {
    return new Set([...group.innerEdges, ...group.attachedEdges]);
}

/** The frames the trial draws larger than the draft, in document order, with how far each grew. */
function grownFrames(
    draft: LayoutModel,
    trial: LayoutModel,
): { readonly id: string; readonly by: number }[] {
    return [...trial.shapes.values()].flatMap((shape) => {
        const before = draft.shapes.get(shape.id);
        if (before === undefined || !isFrame(shape)) return [];
        const by =
            Math.max(0, shape.bounds.width - before.bounds.width) +
            Math.max(0, shape.bounds.height - before.bounds.height);
        return by > 0 ? [{ id: shape.id, by }] : [];
    });
}

/**
 * Whether the trial has no shape spot the draft lacks: no new overlap, shape
 * outside its frame or event off its host, and no pool widened onto another.
 */
export function breaksNothing(draft: LayoutModel, trial: LayoutModel): boolean {
    const changedPools = [...trial.shapes.values()].filter(
        (shape) => shape.kind === "pool" && shape !== draft.shapes.get(shape.id),
    );
    return (
        introducedLayoutSpots(trial, [draft]).every(isFlowSpot) &&
        !changedPools.some((pool) => liesOnAnotherPool(trial, pool))
    );
}
