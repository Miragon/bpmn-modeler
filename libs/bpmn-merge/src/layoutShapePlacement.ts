import type { DrawingDraft } from "./layoutDrawingDraft";
import {
    type DiagramBounds,
    boundsAround,
    inflated,
    keepsClearOf,
    liesWithin,
    segmentEntersBounds,
    translated,
} from "./layoutGeometry";
import { type LayoutShape, framesAroundOf, framesOf } from "./layoutModel";
import { type Segment, segmentsOf } from "./layoutPolyline";
import { type ShapeGroup, groupBoundsIn, groupShapesBoundsIn } from "./layoutShapeGroups";

/** How far, in pixels, a moved shape keeps from other shapes; nearer counts as cramped. */
export const SHAPE_CLEARANCE = 15;

/** How far a moved shape keeps inside the frames it lies in. */
export const FRAME_PADDING = 10;

/** The band at a pool's or lane's start that holds its name. */
const FRAME_HEADER = 30;

/** How far, in pixels, the nearest free place is looked for in each direction, and in which steps. */
const SEARCH_RADIUS = 250;
const SEARCH_STEP = 10;

export interface Offset {
    readonly dx: number;
    readonly dy: number;
}

export const offsetLength = ({ dx, dy }: Offset): number => Math.abs(dx) + Math.abs(dy);

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

/** The part of a frame a node may lie in: off its border, and for a pool or lane off its name band. */
export function innerBoundsOf(frame: LayoutShape): DiagramBounds {
    const inner = inflated(frame.bounds, -FRAME_PADDING);
    if (frame.kind === "node") return inner;
    const { width, height } = frame.bounds;
    return width >= height
        ? { ...inner, x: inner.x + FRAME_HEADER, width: inner.width - FRAME_HEADER }
        : { ...inner, y: inner.y + FRAME_HEADER, height: inner.height - FRAME_HEADER };
}

/** A member of a moving group and a frame outside the group it must stay inside. */
interface KeptInside {
    readonly member: DiagramBounds;
    readonly frame: DiagramBounds;
}

/**
 * Where a node and its group may go in the draft: every member, but a
 * boundary event on its host, inside each frame outside the group it lies in
 * now, off the frame's border where it keeps off it now, and the group's
 * shapes inside the bounds the node is to be brought into, the node then kept
 * only inside the frames it must lie in; clear of every other shape and its
 * label, and off every flow that is not the group's own.
 */
export class Placement {
    private readonly groupBounds: DiagramBounds;
    /** The members' shapes without their labels, which must lie inside `into`. */
    private readonly shapeBounds: DiagramBounds;
    private readonly keptInside: readonly KeptInside[];
    private readonly obstacles: readonly DiagramBounds[];
    private readonly otherSegments: readonly Segment[];

    constructor(
        draft: DrawingDraft,
        group: ShapeGroup,
        window: DiagramBounds,
        private readonly into: readonly DiagramBounds[] = [],
    ) {
        const { node } = group;
        const members = new Set(group.members);
        this.shapeBounds = groupShapesBoundsIn(draft, group);
        const ownEdges = new Set([...group.innerEdges, ...group.attachedEdges]);
        this.groupBounds = groupBoundsIn(draft, group);
        this.keptInside = group.members.flatMap((id) => {
            const member = draft.node(id);
            if (member === undefined || member.host !== undefined) return [];
            // A node brought into its sub-process leaves the lane it lies in now, which the sub-process stands for.
            const frames =
                id === node.id && into.length > 0
                    ? framesOf(draft, member)
                    : framesAroundOf(draft, member);
            return frames
                .filter(
                    (frame) => !members.has(frame.id) && liesWithin(member.bounds, frame.bounds),
                )
                .map((frame) => {
                    const inner = innerBoundsOf(frame);
                    const keptOff = liesWithin(member.bounds, inner);
                    return { member: member.bounds, frame: keptOff ? inner : frame.bounds };
                });
        });
        this.obstacles = draft
            .nodesNear(node.plane, window)
            .filter(({ id }) => !members.has(id) && !node.subProcesses.includes(id))
            .flatMap((other) =>
                other.label === undefined ? [other.bounds] : [other.bounds, other.label],
            );
        this.otherSegments = draft
            .edgesNear(node.plane, window)
            .filter(({ id }) => !ownEdges.has(id))
            .flatMap(({ waypoints }) => segmentsOf(waypoints));
    }

    /** The search window for a placement anywhere within the search radius. */
    static searchWindowOf(draft: DrawingDraft, group: ShapeGroup): DiagramBounds {
        return inflated(groupBoundsIn(draft, group), SEARCH_RADIUS + SHAPE_CLEARANCE);
    }

    fits({ dx, dy }: Offset): boolean {
        const box = translated(this.groupBounds, dx, dy);
        const movedShapes = translated(this.shapeBounds, dx, dy);
        return (
            this.into.every((frame) => liesWithin(movedShapes, frame)) &&
            this.keptInside.every(({ member, frame }) =>
                liesWithin(translated(member, dx, dy), frame),
            ) &&
            this.obstacles.every((obstacle) => keepsClearOf(box, obstacle, SHAPE_CLEARANCE)) &&
            !this.otherSegments.some(([from, to]) => segmentEntersBounds(from, to, box))
        );
    }

    /** The nearest offset within the search radius that fits. */
    nearestFit(): Offset | undefined {
        return SEARCH_OFFSETS.find((offset) => this.fits(offset));
    }

    /** The search window for a placement within the search radius of the group moved by the offset. */
    static searchWindowFrom(draft: DrawingDraft, group: ShapeGroup, base: Offset): DiagramBounds {
        const bounds = groupBoundsIn(draft, group);
        return inflated(
            boundsAround([bounds, translated(bounds, base.dx, base.dy)]),
            SEARCH_RADIUS + SHAPE_CLEARANCE,
        );
    }

    /** The offset that fits nearest to `base`, within the search radius around it. */
    nearestFitFrom(base: Offset): Offset | undefined {
        return [{ dx: 0, dy: 0 }, ...SEARCH_OFFSETS]
            .map(({ dx, dy }) => ({ dx: base.dx + dx, dy: base.dy + dy }))
            .find((offset) => this.fits(offset));
    }
}
