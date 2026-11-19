import { DrawingDraft } from "./layoutDrawingDraft";
import { sameBounds } from "./layoutGeometry";
import { type RoomMade, makeRoom } from "./layoutMakeRoom";
import { type LayoutModel, type NodeShape, placeOf, placedByBuild } from "./layoutModel";
import { type ShapeGroup, ShapeGroups } from "./layoutShapeGroups";
import { type Offset, Placement, offsetBetween, offsetLength } from "./layoutShapePlacement";
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
    let draft = DrawingDraft.of(layout);
    const changes = new Map<string, ShapeChange>();
    const repairs = overlaps.map(({ shapes }): OverlapRepair => {
        const pair = shapes.map((id) => draft.node(id));
        const [first, second] = pair;
        if (first === undefined || second === undefined) return { kind: "notRepaired", shapes };
        if (!shapesOverlap(first, second)) return resolvedEarlier(shapes, changes);
        const movable = [first, second]
            .filter((node) => placedByBuild(node, sides))
            .map((node) => groups.of(draft, node));
        const move = otherSidesPlace(draft, movable, sides) ?? nearestFreePlace(draft, movable);
        if (move !== undefined) {
            draft.translate(move.group, move.dx, move.dy);
            const repair = { kind: "movedByBuild", shapes, moved: move.group.node.id } as const;
            for (const id of move.group.members) changes.set(id, { repair, withMovedGroup: true });
            return repair;
        }
        const room = roomFor(draft, movable, [first, second]);
        if (room === undefined) return { kind: "notRepaired", shapes };
        const moved = room.group.node.id;
        const repair: MoveRepair =
            room.shifted.length === 0
                ? { kind: "movedByBuild", shapes, moved }
                : { kind: "madeRoom", shapes, moved, shifted: room.shifted };
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
            return Placement.fitsAt(draft, group, offset) ? [{ group, ...offset }] : [];
        }),
    );
    return shortestOf(moves);
}

function nearestFreePlace(draft: DrawingDraft, movable: readonly ShapeGroup[]): Move | undefined {
    return shortestOf(
        movable.flatMap((group) => {
            const window = Placement.searchWindowOf(draft, group);
            const offset = new Placement(draft, group, window).nearestFit();
            return offset === undefined ? [] : [{ group, ...offset }];
        }),
    );
}

function roomFor(
    draft: DrawingDraft,
    movable: readonly ShapeGroup[],
    pair: readonly NodeShape[],
): (RoomMade & { readonly group: ShapeGroup }) | undefined {
    const made = movable.flatMap((group) => {
        const other = pair.find(({ id }) => id !== group.node.id)!;
        const room = makeRoom(draft, group, other);
        return room === undefined ? [] : [{ ...room, group }];
    });
    return made.reduce<(typeof made)[number] | undefined>(
        (fewest, room) =>
            fewest === undefined || room.shifted.length < fewest.shifted.length ? room : fewest,
        undefined,
    );
}

/** The shortest of the moves, the first of equally short ones. */
function shortestOf(moves: readonly Move[]): Move | undefined {
    return moves.reduce<Move | undefined>(
        (shortest, move) =>
            shortest === undefined || offsetLength(move) < offsetLength(shortest) ? move : shortest,
        undefined,
    );
}
