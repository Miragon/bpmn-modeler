import { framesAroundOf, framesOf } from "./layoutFrames";
import {
    type DiagramBounds,
    type Offset,
    areaOutside,
    bottomOf,
    inflated,
    liesWithin,
    rightOf,
    translated,
} from "./layoutGeometry";
import { type LayoutModel, type LayoutShape, type NodeShape, nodeShapeIn } from "./layoutModel";
import { type ShapeGroup, groupShapesBoundsIn } from "./layoutShapeGroups";

/** How far a moved shape keeps inside the frames it lies in. */
export const FRAME_PADDING = 10;

/** The band at a pool's or lane's start, or at a sub-process's top, that holds its name. */
const FRAME_HEADER = 30;

/** The part of a frame a node may lie in: off its border and off its name band. */
export function innerBoundsOf(frame: LayoutShape): DiagramBounds {
    const inner = inflated(frame.bounds, -FRAME_PADDING);
    if (frame.kind === "node") {
        const top = frame.bounds.y + FRAME_HEADER;
        return { ...inner, y: top, height: bottomOf(inner) - top };
    }
    const { width, height } = frame.bounds;
    return width >= height
        ? { ...inner, x: inner.x + FRAME_HEADER, width: inner.width - FRAME_HEADER }
        : { ...inner, y: inner.y + FRAME_HEADER, height: inner.height - FRAME_HEADER };
}

/**
 * A member of a moving group held in a frame: inside it, off its border
 * where it keeps off it now, or, lying partly outside it now, no further out.
 */
class FrameHold {
    private constructor(
        private readonly member: DiagramBounds,
        private readonly frame: DiagramBounds,
        /** How much of the member lies outside the frame now; zero when it lies inside. */
        private readonly outside: number,
    ) {}

    static of(member: DiagramBounds, frame: LayoutShape): FrameHold {
        const outside = areaOutside(member, frame.bounds);
        if (outside > 0) return new FrameHold(member, frame.bounds, outside);
        const inner = innerBoundsOf(frame);
        return new FrameHold(member, liesWithin(member, inner) ? inner : frame.bounds, 0);
    }

    holdsMovedBy({ dx, dy }: Offset): boolean {
        const moved = translated(this.member, dx, dy);
        return this.outside === 0
            ? liesWithin(moved, this.frame)
            : areaOutside(moved, this.frame) <= this.outside;
    }
}

/**
 * The frames a moving group keeps to: each member, but a boundary event on
 * its host, is held in the frames outside the group it lies in now, and the
 * group's shapes, labels aside, must lie inside the frames it is brought into,
 * off their border and name band.
 */
export class FrameFit {
    private readonly into: readonly DiagramBounds[];
    private readonly shapeBounds: DiagramBounds;
    private readonly holds: readonly FrameHold[];

    constructor(layout: LayoutModel, group: ShapeGroup, intoFrames: readonly LayoutShape[] = []) {
        this.into = intoFrames.map(innerBoundsOf);
        this.shapeBounds = groupShapesBoundsIn(layout, group);
        const members = new Set(group.members);
        const broughtIn = intoFrames.length > 0;
        this.holds = group.members.flatMap((id) => {
            const member = nodeShapeIn(layout, id);
            if (member === undefined || member.host !== undefined) return [];
            const leavesItsLanes = broughtIn && id === group.node.id;
            return framesHolding(layout, member, leavesItsLanes)
                .filter((frame) => !members.has(frame.id))
                .map((frame) => FrameHold.of(member.bounds, frame));
        });
    }

    fitsMovedBy(offset: Offset): boolean {
        const movedShapes = translated(this.shapeBounds, offset.dx, offset.dy);
        return (
            this.into.every((frame) => liesWithin(movedShapes, frame)) &&
            this.holds.every((hold) => hold.holdsMovedBy(offset))
        );
    }

    /** The shortest offset that brings the group's shapes inside the frames it is brought into; undefined when they leave no room for it. */
    offsetInto(): Offset | undefined {
        const bounds = this.shapeBounds;
        const left = Math.max(...this.into.map(({ x }) => x));
        const top = Math.max(...this.into.map(({ y }) => y));
        const right = Math.min(...this.into.map(rightOf));
        const bottom = Math.min(...this.into.map(bottomOf));
        if (right - left < bounds.width || bottom - top < bounds.height) return undefined;
        const shiftInto = (start: number, end: number, from: number, to: number) =>
            start < from ? from - start : end > to ? to - end : 0;
        return {
            dx: shiftInto(bounds.x, rightOf(bounds), left, right),
            dy: shiftInto(bounds.y, bottomOf(bounds), top, bottom),
        };
    }
}

/**
 * The frames that hold the member: those around it, but a pool or lane only
 * when it lies inside it now. A node brought into its sub-process leaves the
 * lane it lies in now, which the sub-process stands for.
 */
function framesHolding(
    layout: LayoutModel,
    member: NodeShape,
    leavesItsLanes: boolean,
): LayoutShape[] {
    const frames = leavesItsLanes ? framesOf(layout, member) : framesAroundOf(layout, member);
    return frames.filter(
        (frame) => frame.kind === "node" || liesWithin(member.bounds, frame.bounds),
    );
}
