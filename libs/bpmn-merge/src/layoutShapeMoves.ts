import { DrawingDraft } from "./layoutDrawingDraft";
import { FlowTopology } from "./layoutFlowTopology";
import { sameBounds } from "./layoutGeometry";
import {
    type RoomContext,
    type RoomMade,
    type RoomSlots,
    freeRoom,
    makeRoom,
    onlyMoves,
    slotOffsetsOf,
    slotsFor,
} from "./layoutMakeRoom";
import { type LayoutModel, type NodeShape, drawnHostOf } from "./layoutModel";
import { placeOf, placedByBuild } from "./sideDrawings";
import { type ShapeGroup, ShapeGroups } from "./layoutShapeGroups";
import {
    OFF_A_SHAPE,
    type Offset,
    Placement,
    offsetBetween,
    offsetLength,
} from "./layoutShapePlacement";
import type { OverlapRepair, SpotRepair } from "./layoutSpotRepairs";
import { type LayoutSpot, shapesOverlap } from "./layoutSpots";

type MoveRepair = Exclude<OverlapRepair, { readonly kind: "notRepaired" }>;

type OverlapSpot = Extract<LayoutSpot, { readonly kind: "shapesOverlap" }>;

const NOT_REPAIRED: OverlapRepair = { kind: "notRepaired" };

/** What a repair did to one shape: moved it with the group it moved, or shifted it to make room. */
interface ShapeChange {
    readonly repair: MoveRepair;
    readonly withMovedGroup: boolean;
}

export interface ShapeMovePlan {
    /** The drawing with every move applied; the input itself when nothing moved. */
    readonly layout: LayoutModel;
    /** One per overlap spot, in the spots' order. */
    readonly repairs: readonly SpotRepair[];
}

interface Move extends Offset {
    readonly group: ShapeGroup;
}

/**
 * Moves one shape of every two the spots name on top of each other: one that
 * not both sides draw where the result does (one side moved it, or only one
 * side has it), never a boundary event, which stays on its host. It goes with
 * its label, boundary events and contents to the first place
 * `OverlapRepairer.repair` finds. A move of one shape that resolves several
 * spots counts for each.
 */
export function planShapeMoves(
    layout: LayoutModel,
    spots: readonly LayoutSpot[],
    sides: readonly LayoutModel[],
): ShapeMovePlan {
    const overlaps = spots.flatMap((spot): OverlapSpot[] =>
        spot.kind === "shapesOverlap" ? [spot] : [],
    );
    if (overlaps.length === 0) return { layout, repairs: [] };
    const repairer = new OverlapRepairer(layout, sides);
    const repairs = overlaps.map((spot) => ({ spot, repair: repairer.repair(spot) }));
    return { layout: repairer.layout, repairs };
}

/** Ends overlaps one after another, on a draft of the drawing. */
class OverlapRepairer {
    private readonly groups: ShapeGroups;
    private readonly room: RoomContext;
    private draft: DrawingDraft;
    /** What the repairs so far did to each shape they changed. */
    private readonly changes = new Map<string, ShapeChange>();

    constructor(
        original: LayoutModel,
        private readonly sides: readonly LayoutModel[],
    ) {
        this.groups = new ShapeGroups(original);
        this.room = { groups: this.groups, topology: new FlowTopology(original) };
        this.draft = DrawingDraft.of(original);
    }

    get layout(): LayoutModel {
        return this.draft.changedOrOriginal;
    }

    /** Ends the overlap with the first attempt that can: the other side's place, a stacked branch, the nearest free place, room in line. */
    repair({ shapes }: OverlapSpot): OverlapRepair {
        const { draft } = this;
        const [first, second] = shapes.map((id) => draft.node(id));
        if (first === undefined || second === undefined) return NOT_REPAIRED;
        const pair = [first, second] as const;
        if (endedEarlier(pair)) return resolvedEarlier(shapes, this.changes);
        const movable = pair
            .filter((node) => placedByBuild(node, this.sides))
            .map((node) => this.groups.of(draft, node));
        return (
            this.moveOf(otherSidesPlace(draft, movable, this.sides)) ??
            this.roomOf(stackedBranch(draft, this.room, movable, pair)) ??
            this.moveOf(nearestFreePlace(draft, movable)) ??
            this.roomOf(roomInLine(draft, this.room, movable, pair)) ??
            NOT_REPAIRED
        );
    }

    /** The repair that moves the group with every shape it carries. */
    private moveOf(move: Move | undefined): MoveRepair | undefined {
        if (move === undefined) return undefined;
        const { group } = move;
        this.draft.translate(group, move.dx, move.dy);
        const repair = { kind: "movedByBuild", moved: group.node.id } as const;
        this.record(repair, group, group.members);
        return repair;
    }

    /** The repair that takes the draft the room was made on. */
    private roomOf(room: GroupRoom | undefined): MoveRepair | undefined {
        if (room === undefined) return undefined;
        const repair = roomRepairOf(room);
        this.record(repair, room.group, room.draft.shapesChangedFrom(this.draft));
        this.draft = room.draft;
        return repair;
    }

    private record(repair: MoveRepair, group: ShapeGroup, changed: readonly string[]): void {
        for (const id of changed) {
            this.changes.set(id, { repair, withMovedGroup: group.members.includes(id) });
        }
    }
}

/** The pair no longer overlaps where the draft draws it, so a repair of an earlier spot ended it. */
function endedEarlier([first, second]: readonly [NodeShape, NodeShape]): boolean {
    return !shapesOverlap(first, second);
}

function roomRepairOf(room: GroupRoom): MoveRepair {
    const moved = room.group.node.id;
    const { shifted, grown } = room;
    return onlyMoves(room)
        ? { kind: "movedByBuild", moved }
        : { kind: "madeRoom", moved, shifted, grown };
}

/**
 * The repair that resolved an overlap on its way, named after the shape of
 * the pair it changed: the one that went with the moved group before one it
 * shifted. It keeps the earlier repair only when that moved a shape of the pair.
 */
function resolvedEarlier(
    shapes: readonly [string, string],
    changes: ReadonlyMap<string, ShapeChange>,
): OverlapRepair {
    const changed = shapes.flatMap((id) => {
        const change = changes.get(id);
        return change === undefined ? [] : [{ id, ...change }];
    });
    const named = changed.find(({ withMovedGroup }) => withMovedGroup) ?? changed[0];
    if (named === undefined) return NOT_REPAIRED;
    return shapes.includes(named.repair.moved)
        ? named.repair
        : { kind: "movedByBuild", moved: named.id };
}

/** The shortest move of a group to where a side draws its node, when the group fits there. */
function otherSidesPlace(
    draft: DrawingDraft,
    movable: readonly ShapeGroup[],
    sides: readonly LayoutModel[],
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

function nearestFreePlace(draft: DrawingDraft, movable: readonly ShapeGroup[]): Move | undefined {
    return shortestOf(
        movable.flatMap((group) => {
            const window = Placement.searchWindowOf(draft, group);
            const offset = new Placement(draft, group, window, OFF_A_SHAPE).nearestFit();
            return offset === undefined ? [] : [{ group, ...offset }];
        }),
    );
}

type GroupRoom = RoomMade & { readonly group: ShapeGroup };

/**
 * A movable shape of the pair stacked below the other, or below the host of
 * a boundary event it lay on, where its slots say so: at the free place in
 * that column, else with room made there.
 */
function stackedBranch(
    draft: DrawingDraft,
    context: RoomContext,
    movable: readonly ShapeGroup[],
    pair: readonly [NodeShape, NodeShape],
): GroupRoom | undefined {
    return leastOf(
        movable.flatMap((group) => {
            const other = otherOf(pair, group);
            if (!slotsOf(draft, context, group, other).stacked) return [];
            const column = drawnHostOf(draft, other) ?? other;
            const free = slotOffsetsOf(draft, context.groups, group, column, "below").find(
                (offset) => Placement.fitsAt(draft, group, offset, OFF_A_SHAPE),
            );
            if (free !== undefined) {
                const trial = draft.fork();
                trial.translate(group, free.dx, free.dy);
                return [{ ...freeRoom(trial), group }];
            }
            const room = makeRoom(draft, context, group, column, "below");
            return room === undefined ? [] : [{ ...room, group }];
        }),
    );
}

/** Room for a movable shape of the pair in line with the other, in the first of its slots in line that has room. */
function roomInLine(
    draft: DrawingDraft,
    context: RoomContext,
    movable: readonly ShapeGroup[],
    pair: readonly [NodeShape, NodeShape],
): GroupRoom | undefined {
    return leastOf(
        movable.flatMap((group) => {
            const other = otherOf(pair, group);
            for (const slot of slotsOf(draft, context, group, other).inLine) {
                const room = makeRoom(draft, context, group, other, slot);
                if (room !== undefined) return [{ ...room, group }];
            }
            return [];
        }),
    );
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

function otherOf(pair: readonly [NodeShape, NodeShape], group: ShapeGroup): NodeShape {
    return pair[0].id === group.node.id ? pair[1] : pair[0];
}

/** The room that shifts the fewest shapes, then grows the frames least, then moves the shape with the fewest flows; the first of equal ones. */
function leastOf(rooms: readonly GroupRoom[]): GroupRoom | undefined {
    const cost = ({ shifted, growth, group }: GroupRoom) =>
        [shifted.length, growth, group.attachedEdges.length] as const;
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
