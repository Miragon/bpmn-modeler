import { DrawingDraft } from "./layoutDrawingDraft";
import { FlowTopology } from "./layoutFlowTopology";
import { sameBounds } from "./layoutGeometry";
import {
    type RoomContext,
    type RoomMade,
    inLineSlotFor,
    makeRoom,
    slotOffsetOf,
} from "./layoutMakeRoom";
import { type LayoutModel, type NodeShape } from "./layoutModel";
import { placeOf, placedByBuild } from "./sideDrawings";
import { type ShapeGroup, ShapeGroups } from "./layoutShapeGroups";
import {
    OFF_A_SHAPE,
    type Offset,
    Placement,
    offsetBetween,
    offsetLength,
} from "./layoutShapePlacement";
import { type LayoutSpot, shapesOverlap } from "./layoutSpots";

/** What the build did about two shapes on top of each other. */
export type OverlapRepair =
    | {
          readonly kind: "movedByBuild";
          readonly shapes: readonly [string, string];
          readonly moved: string;
      }
    | {
          readonly kind: "madeRoom";
          readonly shapes: readonly [string, string];
          readonly moved: string;
          /** The outermost shapes shifted to make the room, in document order. */
          readonly shifted: readonly string[];
          /** The sub-processes, lanes and pools that grew to hold it, in document order. */
          readonly grown: readonly string[];
      }
    | { readonly kind: "notRepaired"; readonly shapes: readonly [string, string] };

type MoveRepair = Exclude<OverlapRepair, { readonly kind: "notRepaired" }>;

/** What a repair did to one shape: moved it with the group it moved, or shifted it to make room. */
interface ShapeChange {
    readonly repair: MoveRepair;
    readonly withMovedGroup: boolean;
}

export interface ShapeMovePlan {
    /** The drawing with every move applied; the input itself when nothing moved. */
    readonly layout: LayoutModel;
    /** One per overlap spot, in the spots' order. */
    readonly repairs: readonly OverlapRepair[];
}

interface Move extends Offset {
    readonly group: ShapeGroup;
}

/**
 * Moves one shape of every two the spots name on top of each other: one that
 * not both sides draw where the result does (one side moved it, or only one
 * side has it), never a boundary event, which stays on its host. It goes, with its label, boundary
 * events and contents, to where the other side draws it when that is free,
 * else to the nearest free place in its frames, and only then gets room made
 * for it right of the other shape. A move of one shape that resolves several
 * spots counts for each.
 */
export function planShapeMoves(
    layout: LayoutModel,
    spots: readonly LayoutSpot[],
    sides: readonly LayoutModel[],
): ShapeMovePlan {
    const overlaps = spots.flatMap((spot) => (spot.kind === "shapesOverlap" ? [spot] : []));
    if (overlaps.length === 0) return { layout, repairs: [] };
    const groups = new ShapeGroups(layout);
    const context: RoomContext = { groups, topology: new FlowTopology(layout) };
    let draft = DrawingDraft.of(layout);
    const changes = new Map<string, ShapeChange>();
    const repairs = overlaps.map(({ shapes }): OverlapRepair => {
        const [first, second] = shapes.map((id) => draft.node(id));
        if (first === undefined || second === undefined) return { kind: "notRepaired", shapes };
        if (!shapesOverlap(first, second)) return resolvedEarlier(shapes, changes);
        const movable = [first, second]
            .filter((node) => placedByBuild(node, sides))
            .map((node) => groups.of(draft, node));
        const pair = [first, second] as const;
        const placed = otherSidesPlace(draft, movable, sides);
        const stacked = placed === undefined ? stackedBranch(draft, context, movable, pair) : undefined;
        const move = placed ?? (stacked === undefined ? nearestFreePlace(draft, movable) : undefined);
        if (move !== undefined) {
            draft.translate(move.group, move.dx, move.dy);
            const repair = { kind: "movedByBuild", shapes, moved: move.group.node.id } as const;
            for (const id of move.group.members) changes.set(id, { repair, withMovedGroup: true });
            return repair;
        }
        const room = stacked ?? roomInLine(draft, context, movable, pair);
        if (room === undefined) return { kind: "notRepaired", shapes };
        const moved = room.group.node.id;
        const { shifted, grown } = room;
        const repair: MoveRepair =
            shifted.length === 0 && grown.length === 0
                ? { kind: "movedByBuild", shapes, moved }
                : { kind: "madeRoom", shapes, moved, shifted, grown };
        for (const [id, shape] of room.draft.shapes) {
            const withMovedGroup = room.group.members.includes(id);
            if (draft.shapes.get(id) !== shape) changes.set(id, { repair, withMovedGroup });
        }
        draft = room.draft;
        return repair;
    });
    return { layout: draft.changed ? draft : layout, repairs };
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
    if (named === undefined) return { kind: "notRepaired", shapes };
    return shapes.includes(named.repair.moved)
        ? { ...named.repair, shapes }
        : { kind: "movedByBuild", shapes, moved: named.id };
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
            return Placement.fitsAt(draft, group, offset, OFF_A_SHAPE) ? [{ group, ...offset }] : [];
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
 * A movable shape of the pair stacked below the other as a parallel branch,
 * where the flows there run right: at the free place in the other's column,
 * else with room made there.
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
            const { topology } = context;
            const branches =
                topology.relationOf(group.node.id, other.id) === "parallel" &&
                topology.flowsRightAt([group.node.id, other.id]);
            if (!branches) return [];
            const offset = slotOffsetOf(draft, group, other, "below");
            if (Placement.fitsAt(draft, group, offset, OFF_A_SHAPE)) {
                const trial = draft.fork();
                trial.translate(group, offset.dx, offset.dy);
                return [{ draft: trial, shifted: [], grown: [], growth: 0, group }];
            }
            const room = makeRoom(draft, context, group, other, "below");
            return room === undefined ? [] : [{ ...room, group }];
        }),
    );
}

/** Room for a movable shape of the pair in line with the other, before it when the shape leads into it and the flows there run right, else after it. */
function roomInLine(
    draft: DrawingDraft,
    context: RoomContext,
    movable: readonly ShapeGroup[],
    pair: readonly [NodeShape, NodeShape],
): GroupRoom | undefined {
    return leastOf(
        movable.flatMap((group) => {
            const other = otherOf(pair, group);
            const { topology } = context;
            const slot = topology.flowsRightAt([group.node.id, other.id])
                ? inLineSlotFor(topology.relationOf(group.node.id, other.id))
                : "after";
            const room =
                makeRoom(draft, context, group, other, slot) ??
                (slot === "after" ? undefined : makeRoom(draft, context, group, other));
            return room === undefined ? [] : [{ ...room, group }];
        }),
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
