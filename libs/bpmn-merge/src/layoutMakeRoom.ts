import type { DrawingDraft } from "./layoutDrawingDraft";
import type { FlowRelation, FlowTopology } from "./layoutFlowTopology";
import { type Axis, bottomOf, centerOf, inflated, rightOf, translated } from "./layoutGeometry";
import {
    type LayoutModel,
    type NodeShape,
    drawnPartsOf,
    isFrame,
    liesOnAnotherPool,
} from "./layoutModel";
import { ROOM_GAP, RoomPush, type RoomRequest, STACK_GAP, leadAlong } from "./layoutRoomPush";
import { type ShapeGroup, type ShapeGroups, groupBoundsIn, ownEdgesOf } from "./layoutShapeGroups";
import { crampsNoFlow, foreignFlowsNear, keepsClearOfFlows } from "./layoutFlowClearance";
import { type Offset, SHAPE_CLEARANCE } from "./layoutShapePlacement";
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

/** Where a modeller draws the moved shape against the other: stacked below it or not, then the slots in line to try in turn. */
export interface RoomSlots {
    readonly stacked: boolean;
    readonly inLine: readonly RoomSlot[];
}

/**
 * The slots for a moved shape that stands so to the other by the flows: a
 * parallel branch stacked below it, a shape that leads into it before it,
 * else after it. Where the flows do not run right, only after it.
 */
export function slotsFor(relation: FlowRelation, flowsRight: boolean): RoomSlots {
    if (!flowsRight) return { stacked: false, inLine: ["after"] };
    return {
        stacked: relation === "parallel",
        inLine: relation === "precedes" ? ["before", "after"] : ["after"],
    };
}

/** How far along the flow the group is looked for past its slot, in which steps. */
const SLOT_STEP = 10;
const AFTER_STEPS = ROOM_GAP / SLOT_STEP;

/**
 * The moves of the group to lie in the slot against the other shape, the
 * first to try first: after it, then further along the flow; before it;
 * below it and its label and boundary events, then along the flow while the
 * group stays under it, the places clear of the flows that are not the
 * group's own and their labels first, then those clear of the labels, as a
 * room may still shift a flow away.
 */
export function slotOffsetsOf(
    draft: DrawingDraft,
    groups: ShapeGroups,
    group: ShapeGroup,
    other: NodeShape,
    slot: RoomSlot,
): Offset[] {
    const { node } = group;
    switch (slot) {
        case "after": {
            const dx = rightOf(other.bounds) + ROOM_GAP - node.bounds.x;
            return Array.from({ length: AFTER_STEPS + 1 }, (_, step) => ({
                dx: dx + step * SLOT_STEP,
                dy: 0,
            }));
        }
        case "below": {
            const groupBounds = groupBoundsIn(draft, group);
            const column = groupBoundsIn(draft, groups.of(draft, other));
            const under = {
                dx: centerOf(other.bounds).x - centerOf(node.bounds).x,
                dy: bottomOf(column) + STACK_GAP - groupBounds.y,
            };
            const steps = Math.floor(other.bounds.width / 2 / SLOT_STEP);
            const offsets = Array.from({ length: steps + 1 }, (_, step) => ({
                ...under,
                dx: under.dx + step * SLOT_STEP,
            })).map((offset) => {
                const box = translated(groupBounds, offset.dx, offset.dy);
                const flows = foreignFlowsNear(draft, group, inflated(box, SHAPE_CLEARANCE));
                return {
                    offset,
                    clearOfFlows: keepsClearOfFlows(box, flows, SHAPE_CLEARANCE),
                    clearOfLabels: keepsClearOfFlows(
                        box,
                        { ...flows, segments: [] },
                        SHAPE_CLEARANCE,
                    ),
                };
            });
            return [
                ...offsets.filter(({ clearOfFlows }) => clearOfFlows),
                ...offsets.filter(
                    ({ clearOfFlows, clearOfLabels }) => !clearOfFlows && clearOfLabels,
                ),
            ].map(({ offset }) => offset);
        }
        case "before":
            return [
                {
                    dx: Math.min(0, other.bounds.x - node.bounds.x),
                    dy: centerOf(other.bounds).y - centerOf(node.bounds).y,
                },
            ];
    }
}

/**
 * Makes room for the group in the slot against the shape it lies on, as the
 * modeler's space tool would held over just what is in the way: what the
 * group lands on gives way along the flow, or downward for a stacked branch,
 * with what that lands on; the frames that no longer hold it grow, and the
 * flows between shifted and staying shapes stretch. A stacked branch then
 * stays clear of what lies right of it, and what overlaps the shape above
 * it gives way along the flow with it, as the column is one place. The first of the slot's places where
 * the group keeps clear of the flows that are not its own and their labels
 * once the room is made; undefined when there is none, when the other shape
 * would have to give way in the slot after or below it, or the room breaks
 * the drawing anywhere else: a shape on another, outside its frame, off its
 * host, or a pool on another pool.
 */
export function makeRoom(
    draft: DrawingDraft,
    context: RoomContext,
    group: ShapeGroup,
    other: NodeShape,
    slot: RoomSlot = "after",
): RoomMade | undefined {
    for (const offset of slotOffsetsOf(draft, context.groups, group, other, slot)) {
        const room = roomAt(draft, context, group, other, slot, offset);
        if (room !== undefined) return room;
    }
    return undefined;
}

function roomAt(
    draft: DrawingDraft,
    context: RoomContext,
    group: ShapeGroup,
    other: NodeShape,
    slot: RoomSlot,
    { dx, dy }: Offset,
): RoomMade | undefined {
    const { node } = group;
    let trial = draft.fork();
    trial.translate(group, dx, dy);
    const box = groupBoundsIn(trial, group);
    const exclude = new Set(group.members);
    const stays = new Set([other.id]);
    const push = (axis: Axis, request: RoomRequest) =>
        pushIn(context, draft, trial, axis, group, node.id, request);
    const below = () => {
        const column = groupBoundsIn(draft, context.groups.of(draft, other));
        return push("y", { box, line: bottomOf(column) + 1, exclude, stays });
    };
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
              : below();
    if (first === undefined) return undefined;
    const pushes = [first];
    if (slot === "below") {
        const column = trial.fork();
        const clear = pushIn(context, trial, column, "x", group, other.id, {
            box,
            column: drawnPartsOf(trial.node(other.id)!),
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
        shapesOverlap(trial.node(node.id)!, trial.node(other.id)!) ||
        !keepsClearOfForeignFlows(trial, group)
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

/** Whether no flow that is not the group's own, nor its label, cramps the group where the trial draws it. */
function keepsClearOfForeignFlows(trial: DrawingDraft, group: ShapeGroup): boolean {
    const box = groupBoundsIn(trial, group);
    const flows = foreignFlowsNear(trial, group, inflated(box, SHAPE_CLEARANCE));
    return crampsNoFlow(box, flows, SHAPE_CLEARANCE);
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
