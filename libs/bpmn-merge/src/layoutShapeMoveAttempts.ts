import type { DrawingDraft } from "./layoutDrawingDraft";
import { flowClashesOf } from "./layoutFlowClashes";
import { withFlowsRerouted } from "./layoutFlowRepair";
import { sameBounds } from "./layoutGeometry";
import {
    type RoomContext,
    type RoomMade,
    type RoomSlot,
    type RoomSlots,
    freeRoom,
    makeRoom,
    slotOffsetsOf,
    slotsFor,
} from "./layoutMakeRoom";
import { type LayoutModel, type NodeShape, drawnHostOf } from "./layoutModel";
import type { ShapeGroup } from "./layoutShapeGroups";
import {
    OFF_A_SHAPE,
    type Offset,
    Placement,
    offsetBetween,
    offsetLength,
} from "./layoutShapePlacement";
import { placeOf } from "./sideDrawings";

/** What the attempts read beside the draft: what moves with a node, how the flows join the nodes, and the sides' drawings. */
export interface AttemptContext extends RoomContext {
    readonly sides: readonly LayoutModel[];
}

export interface Move extends Offset {
    readonly group: ShapeGroup;
}

export type GroupRoom = RoomMade & {
    readonly group: ShapeGroup;
    /** How often the group's flows cross or run on another flow once the flow repair re-routed them. */
    readonly flowClashes: number;
};

type Pair = readonly [NodeShape, NodeShape];

/** The shortest move of a group to where a side draws its node, when the group fits there. */
export function otherSidesPlace(
    draft: DrawingDraft,
    { sides }: AttemptContext,
    movable: readonly ShapeGroup[],
): Move | undefined {
    const moves = movable.flatMap((group) =>
        sides.flatMap((side): Move[] => {
            const place = placeOf(side, group.node);
            if (place === undefined || sameBounds(place, group.node.bounds)) return [];
            const offset = offsetBetween(group.node.bounds, place);
            return Placement.fitsAt(draft, group, offset, OFF_A_SHAPE)
                ? [{ group, ...offset }]
                : [];
        }),
    );
    return shortestOf(moves);
}

export function nearestFreePlace(
    draft: DrawingDraft,
    movable: readonly ShapeGroup[],
): Move | undefined {
    return shortestOf(
        movable.flatMap((group) => {
            const window = Placement.searchWindowOf(draft, group);
            const offset = new Placement(draft, group, window, OFF_A_SHAPE).nearestFit();
            return offset === undefined ? [] : [{ group, ...offset }];
        }),
    );
}

/**
 * A movable shape of the pair stacked below the other, or below the host of
 * a boundary event it lay on, where its slots say so: at the free place in
 * that column, else with room made there.
 */
export function stackedBranch(
    draft: DrawingDraft,
    context: AttemptContext,
    movable: readonly ShapeGroup[],
    pair: Pair,
): GroupRoom | undefined {
    return leastOf(
        movable.flatMap((group) => {
            const other = otherOf(pair, group);
            if (!slotsOf(draft, context, group, other).stacked) return [];
            const column = drawnHostOf(draft, other) ?? other;
            const free = slotOffsetsOf(draft, context.groups, group, column, "below").find(
                (offset) => Placement.fitsAt(draft, group, offset, OFF_A_SHAPE),
            );
            if (free === undefined) return roomsIn(draft, context, group, other, ["below"]);
            const trial = draft.fork();
            trial.translate(group, free.dx, free.dy);
            return [weighed(freeRoom(trial), group, context)];
        }),
    );
}

/**
 * Room for a movable shape of the pair in line with the other, in the first
 * of its slots in line that has room; in one of the slots left where the
 * moved shape's flows clash with fewer other flows there.
 */
export function roomInLine(
    draft: DrawingDraft,
    context: AttemptContext,
    movable: readonly ShapeGroup[],
    pair: Pair,
): GroupRoom | undefined {
    const slotsOfGroup = (group: ShapeGroup) =>
        slotsOf(draft, context, group, otherOf(pair, group));
    const inLine = leastOf(
        movable.flatMap((group) => {
            for (const slot of slotsOfGroup(group).inLine) {
                const rooms = roomsIn(draft, context, group, otherOf(pair, group), [slot]);
                if (rooms.length > 0) return rooms;
            }
            return [];
        }),
    );
    if (inLine === undefined || clearOfFlows(inLine)) return inLine;
    const otherwise = leastOf(
        movable.flatMap((group) =>
            roomsIn(draft, context, group, otherOf(pair, group), slotsOfGroup(group).otherwise),
        ),
    );
    return otherwise !== undefined && clashesLess(otherwise, inLine) ? otherwise : inLine;
}

/** The rooms for the group in each of the slots against the other shape; below its host when the other is a boundary event. */
function roomsIn(
    draft: DrawingDraft,
    context: AttemptContext,
    group: ShapeGroup,
    other: NodeShape,
    slots: readonly RoomSlot[],
): GroupRoom[] {
    return slots.flatMap((slot) => {
        const against = slot === "below" ? (drawnHostOf(draft, other) ?? other) : other;
        const room = makeRoom(draft, context, group, against, slot);
        return room === undefined ? [] : [weighed(room, group, context)];
    });
}

/** The room with how often the group's flows clash with other flows once the flow repair re-routed those the room left broken. */
function weighed(room: RoomMade, group: ShapeGroup, { sides }: AttemptContext): GroupRoom {
    const flows = group.attachedEdges;
    const rerouted = withFlowsRerouted(room.draft, flows, sides);
    return { ...room, group, flowClashes: flowClashesOf(rerouted, flows) };
}

function clearOfFlows(room: GroupRoom): boolean {
    return room.flowClashes === 0;
}

function clashesLess(room: GroupRoom, than: GroupRoom): boolean {
    return room.flowClashes < than.flowClashes;
}

/** The slots for the group against the other shape, by how the flows join them and run where the draft draws them. */
function slotsOf(
    draft: DrawingDraft,
    { topology }: RoomContext,
    group: ShapeGroup,
    other: NodeShape,
): RoomSlots {
    const pair = [group.node.id, other.id];
    return slotsFor(
        topology.relationOf(group.node.id, other.id),
        topology.flowsRightAt(draft, pair),
    );
}

function otherOf(pair: Pair, group: ShapeGroup): NodeShape {
    return pair[0].id === group.node.id ? pair[1] : pair[0];
}

/**
 * The room whose group's flows clash least, then that shifts the fewest
 * shapes, grows the frames least and moves the shape with the fewest flows;
 * the first of equal ones.
 */
function leastOf(rooms: readonly GroupRoom[]): GroupRoom | undefined {
    const cost = ({ flowClashes, shifted, growth, group }: GroupRoom) =>
        [flowClashes, shifted.length, growth, group.attachedEdges.length] as const;
    return rooms.reduce<GroupRoom | undefined>((least, room) => {
        if (least === undefined) return room;
        const [mine, theirs] = [cost(room), cost(least)];
        const at = mine.findIndex((value, index) => value !== theirs[index]);
        return at !== -1 && mine[at]! < theirs[at]! ? room : least;
    }, undefined);
}

/** The shortest of the moves, the first of equally short ones. */
function shortestOf(moves: readonly Move[]): Move | undefined {
    return moves.reduce<Move | undefined>(
        (shortest, move) =>
            shortest === undefined || offsetLength(move) < offsetLength(shortest) ? move : shortest,
        undefined,
    );
}
