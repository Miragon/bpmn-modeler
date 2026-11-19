import { DrawingDraft } from "./layoutDrawingDraft";
import { boundsAround, inflated, sameBounds, translated } from "./layoutGeometry";
import { type RoomMade, makeRoom } from "./layoutMakeRoom";
import { type LayoutModel, type NodeShape, drawsAt, placeOf } from "./layoutModel";
import { type ShapeGroup, ShapeGroups, groupBoundsIn } from "./layoutShapeGroups";
import { type Offset, Placement, SHAPE_CLEARANCE, offsetLength } from "./layoutShapePlacement";
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
 * Moves one shape of every two the spots name on top of each other: the one
 * the build placed, which neither side draws where the result does, never a
 * boundary event, which stays on its host. It goes, with its label, boundary
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
    const repairsByShape = new Map<string, OverlapRepair>();
    const repairs = overlaps.map(({ shapes }): OverlapRepair => {
        const pair = shapes.map((id) => draft.node(id));
        const [first, second] = pair;
        if (first === undefined || second === undefined) return { kind: "notRepaired", shapes };
        if (!shapesOverlap(first, second)) {
            const earlier = repairsByShape.get(first.id) ?? repairsByShape.get(second.id);
            return earlier === undefined ? { kind: "notRepaired", shapes } : { ...earlier, shapes };
        }
        const movable = [first, second]
            .filter((node) => placedByBuild(node, sides))
            .map((node) => groups.of(draft, node));
        const move = otherSidesPlace(draft, movable, sides) ?? nearestFreePlace(draft, movable);
        if (move !== undefined) {
            draft.translate(move.group, move.dx, move.dy);
            const repair = { kind: "movedByBuild", shapes, moved: move.group.node.id } as const;
            for (const id of move.group.members) repairsByShape.set(id, repair);
            return repair;
        }
        const room = roomFor(draft, movable, [first, second]);
        if (room === undefined) return { kind: "notRepaired", shapes };
        const repair: OverlapRepair =
            room.shifted.length === 0
                ? { kind: "movedByBuild", shapes, moved: room.moved }
                : { kind: "madeRoom", shapes, moved: room.moved, shifted: room.shifted };
        for (const [id, shape] of room.draft.shapes) {
            if (draft.shapes.get(id) !== shape) repairsByShape.set(id, repair);
        }
        draft = room.draft;
        return repair;
    });
    return { layout: draft.changed ? draft : layout, repairs };
}

/** A shape the build placed: no side draws it just where the result does; a boundary event goes with its host. */
function placedByBuild(node: NodeShape, sides: readonly LayoutModel[]): boolean {
    return node.host === undefined && !sides.every((side) => drawsAt(side, node));
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
            const offset = { dx: place.x - group.node.bounds.x, dy: place.y - group.node.bounds.y };
            const bounds = groupBoundsIn(draft, group);
            const window = inflated(
                boundsAround([bounds, translated(bounds, offset.dx, offset.dy)]),
                SHAPE_CLEARANCE,
            );
            return new Placement(draft, group, window).fits(offset) ? [{ group, ...offset }] : [];
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
): (RoomMade & { readonly moved: string }) | undefined {
    const made = movable.flatMap((group) => {
        const other = pair.find(({ id }) => id !== group.node.id)!;
        const room = makeRoom(draft, group, other);
        return room === undefined ? [] : [{ ...room, moved: group.node.id }];
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
