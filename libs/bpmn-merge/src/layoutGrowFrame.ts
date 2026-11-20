import type { DrawingDraft } from "./layoutDrawingDraft";
import {
    type Border,
    type DiagramBounds,
    type Offset,
    bordersAt,
    bottomOf,
    centerOf,
    rightOf,
} from "./layoutGeometry";
import { lanesOf } from "./layoutFrames";
import { type LayoutShape, translatedNode } from "./layoutModel";
import { type RoomContext, breaksNothing } from "./layoutMakeRoom";
import { RoomPush } from "./layoutRoomPush";
import { type ShapeGroup, ownEdgesOf } from "./layoutShapeGroups";
import { innerBoundsOf } from "./layoutPlacementFrames";
import { liesOutside } from "./layoutSpots";

export interface FrameGrown {
    readonly draft: DrawingDraft;
    /** The outermost shapes that shifted right to make room for the grown frame, in document order. */
    readonly shifted: readonly string[];
    /** Every shape that moved: the boundary events the grown border carried, and every shape that shifted. */
    readonly moved: readonly string[];
}

interface Growth {
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly bottom: number;
}

/**
 * Grows the frame the group's node lies outside until it holds the node
 * where it lies: a sub-process drawn open to every side, its boundary events
 * going with the border they sit on, a pool with its lanes only sideways,
 * and a lane never on its own, as lanes are stacked. When a sub-process
 * grown right lies on what is beyond it, what it lands on gives way to the
 * right as making room does. Undefined when the growth
 * breaks the drawing anywhere else: a shape on another, outside its frame or
 * off its host, or a pool on another pool.
 */
export function growFrameFor(
    draft: DrawingDraft,
    context: RoomContext,
    group: ShapeGroup,
    frames: readonly LayoutShape[],
): FrameGrown | undefined {
    const { node } = group;
    const frame =
        frames.find(({ kind }) => kind === "node") ?? frames.find(({ kind }) => kind === "pool");
    const lanes = frames.filter(({ kind }) => kind === "lane");
    if (frame === undefined || !lanes.every((lane) => holdsLevel(lane, node.bounds))) {
        return undefined;
    }
    const growth = growthToHold(frame.kind === "pool" ? [frame, ...lanes] : [frame], node.bounds);
    if (frame.kind === "pool" && (growth.top > 0 || growth.bottom > 0)) return undefined;
    const holds = (trial: DrawingDraft) =>
        breaksNothing(draft, trial) &&
        frames.every((outer) => !liesOutside(trial.node(node.id)!, trial.shapes.get(outer.id)!));

    const inPlace = grownIn(draft, frame, growth);
    if (holds(inPlace.draft)) return { draft: inPlace.draft, shifted: [], moved: inPlace.carried };
    if (frame.kind !== "node" || growth.right === 0) return undefined;
    const { draft: trial, carried } = grownIn(draft, frame, growth);
    const grown = trial.node(frame.id)!;
    const push = new RoomPush(draft, trial, context.groups, context.topology, "x");
    const made = push.push(grown, {
        box: { ...grown.bounds, x: rightOf(frame.bounds), width: growth.right },
        line: rightOf(frame.bounds),
        exclude: new Set([...group.members, frame.id]),
        frameGrowth: growth.right,
    });
    if (!made) return undefined;
    push.stretchEdges(frame.plane, ownEdgesOf(group));
    const moved = [...carried, ...push.moved.filter((id) => !carried.includes(id))];
    return holds(trial) ? { draft: trial, shifted: push.shifted, moved } : undefined;
}

/** Whether the lane's band, off its border, holds the bounds from top to bottom. */
function holdsLevel(lane: LayoutShape, bounds: DiagramBounds): boolean {
    const inner = innerBoundsOf(lane);
    return bounds.y >= inner.y && bottomOf(bounds) <= bottomOf(inner);
}

/** How far each frame must grow on each side to hold the bounds off its border. */
function growthToHold(frames: readonly LayoutShape[], bounds: DiagramBounds): Growth {
    const inners = frames.map(innerBoundsOf);
    return {
        left: Math.max(0, ...inners.map((inner) => inner.x - bounds.x)),
        right: Math.max(0, ...inners.map((inner) => rightOf(bounds) - rightOf(inner))),
        top: Math.max(0, ...inners.map((inner) => inner.y - bounds.y)),
        bottom: Math.max(0, ...inners.map((inner) => bottomOf(bounds) - bottomOf(inner))),
    };
}

/**
 * A fork of the draft with the frame grown, a pool's lanes widened with it
 * and the frame's boundary events moved with the border they sit on, and
 * the events it moved.
 */
function grownIn(
    draft: DrawingDraft,
    frame: LayoutShape,
    growth: Growth,
): { readonly draft: DrawingDraft; readonly carried: readonly string[] } {
    const trial = draft.fork();
    const carried: string[] = [];
    const sideways = frame.kind === "pool" ? lanesOf(draft, frame) : [];
    trial.replaceShape(grown(frame, growth));
    for (const lane of sideways) trial.replaceShape(grown(lane, { ...growth, top: 0, bottom: 0 }));
    for (const event of draft.nodesOn(frame.plane).filter(({ host }) => host === frame.id)) {
        const { dx, dy } = borderShiftOf(bordersAt(centerOf(event.bounds), frame.bounds), growth);
        if (dx === 0 && dy === 0) continue;
        trial.replaceShape(translatedNode(event, dx, dy));
        carried.push(event.id);
    }
    return { draft: trial, carried };
}

/** How far a point on the borders moves when they grow. */
function borderShiftOf(borders: readonly Border[], growth: Growth): Offset {
    const by = (border: Border) => (borders.includes(border) ? growth[border] : 0);
    return { dx: by("right") - by("left"), dy: by("bottom") - by("top") };
}

function grown<Shape extends LayoutShape>(
    shape: Shape,
    { left, right, top, bottom }: Growth,
): Shape {
    const { x, y, width, height } = shape.bounds;
    return {
        ...shape,
        bounds: {
            x: x - left,
            y: y - top,
            width: width + left + right,
            height: height + top + bottom,
        },
    };
}
