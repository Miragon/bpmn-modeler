import { isNonEmpty } from "@miragon/bpmn-modeler-types/mergeBuildNoteReaders";

import { CHAIN_ROOMS } from "./layoutChainRoom";
import { DrawingDraft } from "./layoutDrawingDraft";
import type { FlowRepairPlanner } from "./layoutFlowRepair";
import { FlowTopology } from "./layoutFlowTopology";
import type { RoomForGroup } from "./layoutMakeRoom";
import type { LayoutModel, NodeShape } from "./layoutModel";
import { placedByBuild } from "./sideDrawings";
import { type ShapeGroup, ShapeGroups } from "./layoutShapeGroups";
import {
    type AttemptContext,
    type Move,
    nearestFreePlace,
    otherSidesPlace,
    roomInLine,
    roomInLineForOneSided,
    stackedBranch,
} from "./layoutShapeMoveAttempts";
import type { OverlapRepair, SpotRepair } from "./layoutSpotRepairs";
import { type LayoutSpot, type SpotOf, shapesOverlap } from "./layoutSpots";

type MoveRepair = Exclude<OverlapRepair, { readonly kind: "notRepaired" }>;

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

/**
 * Moves one shape of every two the spots name on top of each other: one that
 * not both sides draw where the result does (one side moved it, or only one
 * side has it), never a boundary event, which stays on its host. It goes with
 * its label, boundary events and contents to the first place
 * `OverlapRepairer.repair` finds, a room weighed by where the build's flow
 * repair re-routes the moved shape's flows. A move of one shape that
 * resolves several spots counts for each. Before any of that, the chains of
 * shapes one side added get room as one piece (`CHAIN_ROOMS`), which a
 * repair shape by shape would take apart.
 */
export function planShapeMoves(
    layout: LayoutModel,
    spots: readonly LayoutSpot[],
    sides: readonly LayoutModel[],
    repairFlows: FlowRepairPlanner,
    framing?: LayoutModel,
): ShapeMovePlan {
    const overlaps = spots.flatMap((spot): SpotOf<"shapesOverlap">[] =>
        spot.kind === "shapesOverlap" ? [spot] : [],
    );
    if (overlaps.length === 0) return { layout, repairs: [] };
    const repairer = new OverlapRepairer(layout, sides, repairFlows, framing);
    repairer.giveChainsRoom(overlaps);
    const repairs = overlaps.map((spot) => ({ spot, repair: repairer.repair(spot) }));
    return { layout: repairer.layout, repairs };
}

/** Ends overlaps one after another, on a draft of the drawing. */
class OverlapRepairer {
    private readonly groups: ShapeGroups;
    private readonly context: AttemptContext;
    private readonly placeContext: AttemptContext;
    private draft: DrawingDraft;
    /** What the repairs so far did to each shape they changed. */
    private readonly changes = new Map<string, ShapeChange>();

    constructor(
        original: LayoutModel,
        sides: readonly LayoutModel[],
        repairFlows: FlowRepairPlanner,
        framing: LayoutModel | undefined,
    ) {
        this.groups = new ShapeGroups(original);
        const topology = new FlowTopology(original);
        this.context = { groups: this.groups, topology, sides, repairFlows };
        // Where one side re-laid out the diagram, the other side's coordinates lie in another frame.
        this.placeContext =
            framing === undefined ? this.context : { ...this.context, sides: [framing] };
        this.draft = DrawingDraft.of(original);
    }

    get layout(): LayoutModel {
        return this.draft.changedOrOriginal;
    }

    /**
     * Ends the overlap with the first attempt that can: the other side's place,
     * only the leading side's where one side re-laid out the diagram, a stacked branch, room in line for a shape only one side draws that grows
     * no frame, the nearest free place, room in line.
     */
    repair({ shapes }: SpotOf<"shapesOverlap">): OverlapRepair {
        const { draft } = this;
        const [first, second] = shapes.map((id) => draft.node(id));
        if (first === undefined || second === undefined) return NOT_REPAIRED;
        const pair = [first, second] as const;
        if (endedEarlier(pair)) return resolvedEarlier(shapes, this.changes);
        const movable = pair
            .filter((node) => placedByBuild(node, this.context.sides))
            .map((node) => this.groups.of(draft, node));
        return (
            this.moveOf(otherSidesPlace(draft, this.placeContext, movable)) ??
            this.roomOf(stackedBranch(draft, this.context, movable, pair)) ??
            this.roomOf(roomInLineForOneSided(draft, this.context, movable, pair)) ??
            this.moveOf(nearestFreePlace(draft, movable)) ??
            this.roomOf(roomInLine(draft, this.context, movable, pair)) ??
            NOT_REPAIRED
        );
    }

    /**
     * Gives the chains of shapes one side added room as one piece, each kind
     * of room tried over every overlap before the next. `repair` then names
     * the room for each overlap it ended.
     */
    giveChainsRoom(overlaps: readonly SpotOf<"shapesOverlap">[]): void {
        for (const roomFor of CHAIN_ROOMS) {
            for (const { shapes } of overlaps) {
                const [first, second] = shapes.map((id) => this.draft.node(id));
                if (first === undefined || second === undefined) continue;
                const pair = [first, second] as const;
                if (!endedEarlier(pair)) this.roomOf(roomFor(this.draft, this.context, pair));
            }
        }
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
    private roomOf(room: RoomForGroup | undefined): MoveRepair | undefined {
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

function roomRepairOf(room: RoomForGroup): MoveRepair {
    const moved = room.group.node.id;
    const { shifted, grown } = room;
    if (isNonEmpty(grown)) {
        return isNonEmpty(shifted)
            ? { kind: "madeRoomByGrowingAndShifting", moved, shifted, grown }
            : { kind: "madeRoomByGrowing", moved, grown };
    }
    return isNonEmpty(shifted)
        ? { kind: "madeRoomByShifting", moved, shifted }
        : { kind: "movedByBuild", moved };
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
