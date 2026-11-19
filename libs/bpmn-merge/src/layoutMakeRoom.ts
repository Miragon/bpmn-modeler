import type { DrawingDraft } from "./layoutDrawingDraft";
import type { FlowTopology } from "./layoutFlowTopology";
import { rightOf } from "./layoutGeometry";
import { type LayoutModel, type NodeShape, isFrame, liesOnAnotherPool } from "./layoutModel";
import { ROOM_GAP, RoomPush, leadAlong } from "./layoutRoomPush";
import { type ShapeGroup, type ShapeGroups, groupBoundsIn } from "./layoutShapeGroups";
import { introducedLayoutSpots } from "./layoutSpotDetection";
import { isFlowSpot, shapesOverlap } from "./layoutSpots";

export interface RoomMade {
    readonly draft: DrawingDraft;
    /** The outermost shapes that shifted to make room, in document order; none when the gap past the other shape already held the group. */
    readonly shifted: readonly string[];
    /** The frames that grew to hold the group, in document order. */
    readonly grown: readonly string[];
}

/** What making room reads beside the drawing: what moves with a node and how the flows join the nodes. */
export interface RoomContext {
    readonly groups: ShapeGroups;
    readonly topology: FlowTopology;
}

/**
 * Makes room for the group right of the shape it lies on, as the modeler's
 * space tool would held over just what is in the way: what the group lands on
 * there gives way to the right with what that lands on, the frames that no
 * longer hold it grow, and the flows between shifted and staying shapes
 * stretch. Undefined when the other shape would have to give way too, or the
 * room breaks the drawing anywhere else: a shape on another, outside its
 * frame, off its host, or a pool on another pool.
 */
export function makeRoom(
    draft: DrawingDraft,
    context: RoomContext,
    group: ShapeGroup,
    other: NodeShape,
): RoomMade | undefined {
    const { node } = group;
    const trial = draft.fork();
    trial.translate(group, rightOf(other.bounds) + ROOM_GAP - node.bounds.x, 0);
    const push = new RoomPush(draft, trial, context.groups, context.topology, "x");
    const made = push.push(trial.node(node.id)!, {
        box: groupBoundsIn(trial, group),
        line: rightOf(other.bounds) + 1,
        floor: leadAlong("x", other),
        exclude: new Set(group.members),
        stays: new Set([other.id]),
    });
    if (!made) return undefined;
    push.stretchEdges(node.plane, ownEdgesOf(group));
    if (
        !breaksNothing(draft, trial) ||
        shapesOverlap(trial.node(node.id)!, trial.node(other.id)!)
    ) {
        return undefined;
    }
    return { draft: trial, shifted: push.shifted, grown: grownFrames(draft, trial) };
}

/** The group's own edges, which move with it or which the flow repair re-routes. */
export function ownEdgesOf(group: ShapeGroup): ReadonlySet<string> {
    return new Set([...group.innerEdges, ...group.attachedEdges]);
}

/** The frames the trial draws larger than the draft, in document order. */
function grownFrames(draft: LayoutModel, trial: LayoutModel): string[] {
    return [...trial.shapes.values()].flatMap((shape) => {
        const before = draft.shapes.get(shape.id);
        const grew =
            before !== undefined &&
            isFrame(shape) &&
            (shape.bounds.width > before.bounds.width ||
                shape.bounds.height > before.bounds.height);
        return grew ? [shape.id] : [];
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
