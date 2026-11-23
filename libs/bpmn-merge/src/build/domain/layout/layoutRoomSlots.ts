import type { DrawingDraft } from "./layoutDrawingDraft";
import { foreignFlowsNear, keepsClearOfFlows } from "./layoutFlowClearance";
import type { FlowRelation } from "./layoutFlowTopology";
import { type Offset, bottomOf, centerOf, inflated, rightOf, translated } from "./layoutGeometry";
import { type LayoutModel, type NodeShape, drawnHostOf } from "./layoutModel";
import { ROOM_GAP, STACK_GAP } from "./layoutRoomPush";
import { type ShapeGroup, type ShapeGroups, groupBoundsIn } from "./layoutShapeGroups";
import { SHAPE_CLEARANCE } from "./layoutShapePlacement";

/** The slots in the order the slots left for when flows clash are tried. */
const SLOTS = ["after", "before", "below"] as const;

/**
 * Where the moved group goes against the shape it lay on: in line after it,
 * stacked below it in its column, or in line before it with the other shape
 * pushed on.
 */
export type RoomSlot = (typeof SLOTS)[number];

/**
 * Where a modeller draws the moved shape against the other: stacked below it
 * or not, then the slots in line to try in turn, the first with room taken,
 * then the slots neither stacked in nor listed in line, for when the moved
 * shape's flows would clash with other flows in that room.
 */
export interface RoomSlots {
    readonly stacked: boolean;
    readonly inLine: readonly RoomSlot[];
    readonly otherwise: readonly RoomSlot[];
}

/**
 * The slots for a moved shape that stands so to the other by the flows: a
 * parallel branch stacked below it, a shape that leads into it before it,
 * else after it. Where the flows do not run right, only after it. The slots
 * it neither stacks in nor lists in line are left; a shape that leads into
 * the other lists after it in line only as the fallback for no room before
 * it, so after it is not left.
 */
export function slotsFor(relation: FlowRelation, flowsRight: boolean): RoomSlots {
    const stacked = flowsRight && relation === "parallel";
    const inLine: RoomSlot[] =
        flowsRight && relation === "precedes" ? ["before", "after"] : ["after"];
    const listed: RoomSlot[] = stacked ? [...inLine, "below"] : inLine;
    return { stacked, inLine, otherwise: SLOTS.filter((slot) => !listed.includes(slot)) };
}

/** The shape the group lies against in the slot: below a boundary event's host, as the event lies on its edge. */
export function slotShapeOf(layout: LayoutModel, other: NodeShape, slot: RoomSlot): NodeShape {
    return slot === "below" ? (drawnHostOf(layout, other) ?? other) : other;
}

/** How far along the flow the group is looked for past its slot, in which steps. */
const SLOT_STEP = 10;
const AFTER_STEPS = ROOM_GAP / SLOT_STEP;

/**
 * The moves of the group to lie in the slot against the other shape, the
 * first to try first: after it, then further along the flow; before it;
 * below it, or below the host of the boundary event it is, and its label and
 * boundary events, then along the flow while the group stays under it, the
 * places clear of the flows that are not the group's own and their labels
 * first, then those clear of the labels, as a room may still shift a flow
 * away.
 */
export function slotOffsetsOf(
    draft: DrawingDraft,
    groups: ShapeGroups,
    group: ShapeGroup,
    other: NodeShape,
    slot: RoomSlot,
): Offset[] {
    const { node } = group;
    const against = slotShapeOf(draft, other, slot);
    switch (slot) {
        case "after": {
            const dx = rightOf(against.bounds) + ROOM_GAP - node.bounds.x;
            return Array.from({ length: AFTER_STEPS + 1 }, (_, step) => ({
                dx: dx + step * SLOT_STEP,
                dy: 0,
            }));
        }
        case "below": {
            const groupBounds = groupBoundsIn(draft, group);
            const column = groupBoundsIn(draft, groups.of(draft, against));
            const under = {
                dx: centerOf(against.bounds).x - centerOf(node.bounds).x,
                dy: bottomOf(column) + STACK_GAP - groupBounds.y,
            };
            const steps = Math.floor(against.bounds.width / 2 / SLOT_STEP);
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
                    dx: Math.min(0, against.bounds.x - node.bounds.x),
                    dy: centerOf(against.bounds).y - centerOf(node.bounds).y,
                },
            ];
    }
}
