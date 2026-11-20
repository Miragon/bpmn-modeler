import type { DrawingDraft } from "./layoutDrawingDraft";
import { type Border, type Offset, bordersAt, centerOf } from "./layoutGeometry";
import { FrameToGrow, stripGained } from "./layoutFrameGrowth";
import { type LayoutShape, translatedNode } from "./layoutModel";
import { type RoomContext, breaksNothing } from "./layoutMakeRoom";
import { RoomPush } from "./layoutRoomPush";
import { type ShapeGroup, ownEdgesOf } from "./layoutShapeGroups";
import type { SideGrowth } from "./layoutPlacementFrames";
import { liesOutside } from "./layoutSpots";

export interface FrameGrown {
    readonly draft: DrawingDraft;
    /** The outermost shapes that shifted right to make room for the grown frame, in document order. */
    readonly shifted: readonly string[];
    /** Every shape that moved: the boundary events the grown border carried, and every shape that shifted. */
    readonly moved: readonly string[];
}

/**
 * Grows the frame the group's node lies outside until it holds the node
 * where it lies, as its kind lets it grow (`FrameToGrow`), its boundary
 * events going with the border they sit on. Where its kind lets what lies
 * beyond give way, what the frame grown right lands on gives way to the
 * right as making room does. Undefined when the growth breaks the drawing
 * anywhere else: a shape on another, outside its frame or off its host, or
 * a pool on another pool.
 */
export function growFrameFor(
    draft: DrawingDraft,
    context: RoomContext,
    group: ShapeGroup,
    frames: readonly LayoutShape[],
): FrameGrown | undefined {
    const { node } = group;
    const growing = FrameToGrow.among(frames);
    if (growing === undefined || !growing.lanesHoldLevel(node.bounds)) return undefined;
    const growth = growing.growthToHold(node.bounds);
    if (!growing.mayGrow(growth)) return undefined;
    const holds = (trial: DrawingDraft) =>
        breaksNothing(draft, trial) &&
        frames.every((outer) => !liesOutside(trial.node(node.id)!, trial.shapes.get(outer.id)!));

    const inPlace = grownIn(draft, growing, growth);
    if (holds(inPlace.draft)) return { draft: inPlace.draft, shifted: [], moved: inPlace.carried };
    if (!growing.shiftsWhatLiesBeyond(growth)) return undefined;
    const { frame } = growing;
    const { draft: trial, carried } = grownIn(draft, growing, growth);
    const push = new RoomPush(draft, trial, context.groups, context.topology, "x");
    const grownUpAndDown = grown(frame, { ...growth, left: 0, right: 0 }).bounds;
    const made = push.push(
        trial.node(frame.id)!,
        stripGained("x", grownUpAndDown, growth.right, [...group.members, frame.id]),
    );
    if (!made) return undefined;
    push.stretchEdges(frame.plane, ownEdgesOf(group));
    const moved = [...carried, ...push.moved.filter((id) => !carried.includes(id))];
    return holds(trial) ? { draft: trial, shifted: push.shifted, moved } : undefined;
}

/**
 * A fork of the draft with the frame grown, the lanes that grow with it
 * widened and the frame's boundary events moved with the border they sit
 * on, and the events it moved.
 */
function grownIn(
    draft: DrawingDraft,
    growing: FrameToGrow,
    growth: SideGrowth,
): { readonly draft: DrawingDraft; readonly carried: readonly string[] } {
    const { frame } = growing;
    const trial = draft.fork();
    const carried: string[] = [];
    trial.replaceShape(grown(frame, growth));
    for (const lane of growing.lanesGrowingWith(draft)) {
        trial.replaceShape(grown(lane, { ...growth, top: 0, bottom: 0 }));
    }
    for (const event of draft.nodesOn(frame.plane).filter(({ host }) => host === frame.id)) {
        const { dx, dy } = borderShiftOf(bordersAt(centerOf(event.bounds), frame.bounds), growth);
        if (dx === 0 && dy === 0) continue;
        trial.replaceShape(translatedNode(event, dx, dy));
        carried.push(event.id);
    }
    return { draft: trial, carried };
}

/** How far a point on the borders moves when they grow. */
function borderShiftOf(borders: readonly Border[], growth: SideGrowth): Offset {
    const by = (border: Border) => (borders.includes(border) ? growth[border] : 0);
    return { dx: by("right") - by("left"), dy: by("bottom") - by("top") };
}

function grown<Shape extends LayoutShape>(
    shape: Shape,
    { left, right, top, bottom }: SideGrowth,
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
