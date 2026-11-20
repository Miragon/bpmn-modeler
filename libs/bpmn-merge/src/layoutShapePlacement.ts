import type { DrawingDraft } from "./layoutDrawingDraft";
import {
    type DiagramBounds,
    areaOutside,
    bottomOf,
    boundsAround,
    inflated,
    keepsClearOf,
    liesWithin,
    translated,
} from "./layoutGeometry";
import { type ForeignFlows, foreignFlowsNear, keepsClearOfFlows } from "./layoutFlowClearance";
import { framesAroundOf, framesOf } from "./layoutFrames";
import { type LayoutShape, drawnPartsOf } from "./layoutModel";
import { type ShapeGroup, groupBoundsIn, groupShapesBoundsIn } from "./layoutShapeGroups";

/** How far, in pixels, a moved shape keeps from other shapes; nearer counts as cramped. */
export const SHAPE_CLEARANCE = 15;

/** How far a moved shape keeps inside the frames it lies in. */
export const FRAME_PADDING = 10;

/** The band at a pool's or lane's start, or at a sub-process's top, that holds its name. */
const FRAME_HEADER = 30;

/** How far, in pixels, the nearest free place is looked for in each direction, and in which steps. */
const SEARCH_RADIUS = 250;
const SEARCH_STEP = 10;

export interface Offset {
    readonly dx: number;
    readonly dy: number;
}

export const offsetLength = ({ dx, dy }: Offset): number => Math.abs(dx) + Math.abs(dy);

export function offsetBetween(from: DiagramBounds, to: DiagramBounds): Offset {
    return { dx: to.x - from.x, dy: to.y - from.y };
}

/** Every offset within the radius, nearest first; of equally near ones, the flatter, then the one further right. */
const SEARCH_OFFSETS: readonly Offset[] = (() => {
    const offsets: Offset[] = [];
    for (let dy = -SEARCH_RADIUS; dy <= SEARCH_RADIUS; dy += SEARCH_STEP) {
        for (let dx = -SEARCH_RADIUS; dx <= SEARCH_RADIUS; dx += SEARCH_STEP) {
            if (dx !== 0 || dy !== 0) offsets.push({ dx, dy });
        }
    }
    return offsets.sort(
        (first, second) =>
            offsetLength(first) - offsetLength(second) ||
            Math.abs(first.dy) - Math.abs(second.dy) ||
            second.dx - first.dx ||
            first.dy - second.dy,
    );
})();

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

/** What a placement keeps to beside the other shapes. */
export interface PlacementTerms {
    /** The frames the group is to be brought into. */
    readonly into?: readonly LayoutShape[];
    /** How far it keeps from the flows that are not the group's own and their labels; none keeps it off them. */
    readonly flowClearance?: number;
}

/** A shape moved off another keeps the shape clearance from flows as from shapes. */
export const OFF_A_SHAPE: PlacementTerms = { flowClearance: SHAPE_CLEARANCE };

/** A member of a moving group and a frame outside the group it must stay inside, or come no further out of than it lies now. */
interface KeptInside {
    readonly member: DiagramBounds;
    readonly frame: DiagramBounds;
    /** How much of the member lies outside the frame now; zero when it lies inside. */
    readonly outside: number;
}

/**
 * Where a node and its group may go in the draft: every member, but a
 * boundary event on its host, inside each frame outside the group it lies in
 * now, off the frame's border where it keeps off it now, and the group's
 * shapes inside the frames the node is to be brought into, off their border
 * and name band, the node then kept only inside the frames it must lie in;
 * clear of every other shape and its label, and off every flow that is not
 * the group's own and its label, or clear of them by the terms' clearance.
 */
export class Placement {
    private readonly groupBounds: DiagramBounds;
    /** The members' shapes without their labels, which must lie inside `into`. */
    private readonly shapeBounds: DiagramBounds;
    private readonly into: readonly DiagramBounds[];
    private readonly keptInside: readonly KeptInside[];
    private readonly obstacles: readonly DiagramBounds[];
    private readonly flows: ForeignFlows;
    private readonly flowClearance: number;

    constructor(
        draft: DrawingDraft,
        group: ShapeGroup,
        window: DiagramBounds,
        { into: intoFrames = [], flowClearance = 0 }: PlacementTerms = {},
    ) {
        const { node } = group;
        this.flowClearance = flowClearance;
        this.into = intoFrames.map(innerBoundsOf);
        const members = new Set(group.members);
        this.shapeBounds = groupShapesBoundsIn(draft, group);
        this.groupBounds = groupBoundsIn(draft, group);
        this.keptInside = group.members.flatMap((id) => {
            const member = draft.node(id);
            if (member === undefined || member.host !== undefined) return [];
            // A node brought into its sub-process leaves the lane it lies in now, which the sub-process stands for.
            const frames =
                id === node.id && intoFrames.length > 0
                    ? framesOf(draft, member)
                    : framesAroundOf(draft, member);
            return frames
                .filter(
                    (frame) =>
                        !members.has(frame.id) &&
                        (frame.kind === "node" || liesWithin(member.bounds, frame.bounds)),
                )
                .map((frame) => {
                    const outside = areaOutside(member.bounds, frame.bounds);
                    if (outside > 0) return { member: member.bounds, frame: frame.bounds, outside };
                    const inner = innerBoundsOf(frame);
                    const keptOff = liesWithin(member.bounds, inner);
                    return {
                        member: member.bounds,
                        frame: keptOff ? inner : frame.bounds,
                        outside,
                    };
                });
        });
        this.obstacles = draft
            .nodesNear(node.plane, window)
            .filter(({ id }) => !members.has(id) && !node.subProcesses.includes(id))
            .flatMap(drawnPartsOf);
        this.flows = foreignFlowsNear(draft, group, window);
    }

    /** The search window for a placement anywhere within the search radius. */
    static searchWindowOf(draft: DrawingDraft, group: ShapeGroup): DiagramBounds {
        return windowAround(draft, group, { dx: 0, dy: 0 }, SEARCH_RADIUS + SHAPE_CLEARANCE);
    }

    /** Whether the group fits moved by the offset, on the terms. */
    static fitsAt(
        draft: DrawingDraft,
        group: ShapeGroup,
        offset: Offset,
        terms: PlacementTerms = {},
    ): boolean {
        const window = windowAround(draft, group, offset, SHAPE_CLEARANCE);
        return new Placement(draft, group, window, terms).fits(offset);
    }

    fits({ dx, dy }: Offset): boolean {
        const box = translated(this.groupBounds, dx, dy);
        const movedShapes = translated(this.shapeBounds, dx, dy);
        return (
            this.into.every((frame) => liesWithin(movedShapes, frame)) &&
            this.keptInside.every(({ member, frame, outside }) =>
                outside === 0
                    ? liesWithin(translated(member, dx, dy), frame)
                    : areaOutside(translated(member, dx, dy), frame) <= outside,
            ) &&
            this.obstacles.every((obstacle) => keepsClearOf(box, obstacle, SHAPE_CLEARANCE)) &&
            keepsClearOfFlows(box, this.flows, this.flowClearance)
        );
    }

    /** The nearest offset within the search radius that fits. */
    nearestFit(): Offset | undefined {
        return SEARCH_OFFSETS.find((offset) => this.fits(offset));
    }

    /** The search window for a placement within the search radius of the group moved by the offset. */
    static searchWindowFrom(draft: DrawingDraft, group: ShapeGroup, base: Offset): DiagramBounds {
        return windowAround(draft, group, base, SEARCH_RADIUS + SHAPE_CLEARANCE);
    }

    /** The offset that fits nearest to `base`, within the search radius around it. */
    nearestFitFrom(base: Offset): Offset | undefined {
        return [{ dx: 0, dy: 0 }, ...SEARCH_OFFSETS]
            .map(({ dx, dy }) => ({ dx: base.dx + dx, dy: base.dy + dy }))
            .find((offset) => this.fits(offset));
    }
}

/** The group where it lies and moved by the offset, grown by the margin: what a move there may meet. */
function windowAround(
    draft: DrawingDraft,
    group: ShapeGroup,
    { dx, dy }: Offset,
    margin: number,
): DiagramBounds {
    const bounds = groupBoundsIn(draft, group);
    return inflated(boundsAround([bounds, translated(bounds, dx, dy)]), margin);
}
