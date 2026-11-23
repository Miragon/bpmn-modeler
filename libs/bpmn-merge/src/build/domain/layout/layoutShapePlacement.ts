import type { DrawingDraft } from "./layoutDrawingDraft";
import {
    type DiagramBounds,
    type Offset,
    boundsAround,
    inflated,
    keepsClearOf,
    offsetLength,
    translated,
} from "./layoutGeometry";
import { type ForeignFlows, foreignFlowsNear, keepsClearOfFlows } from "./layoutFlowClearance";
import { type LayoutShape, drawnPartsOf } from "./layoutModel";
import { FrameFit } from "./layoutPlacementFrames";
import { type ShapeGroup, groupBoundsIn } from "./layoutShapeGroups";

/** How far, in pixels, a moved shape keeps from other shapes; nearer counts as cramped. */
export const SHAPE_CLEARANCE = 15;

/** How far, in pixels, the nearest free place is looked for in each direction, and in which steps. */
const SEARCH_RADIUS = 250;
const SEARCH_STEP = 10;

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

/** What a placement keeps to beside the other shapes. */
export interface PlacementTerms {
    /** The frames the group is to be brought into. */
    readonly into?: readonly LayoutShape[];
    /** How far it keeps from the flows that are not the group's own and their labels; none keeps it off them. */
    readonly flowClearance?: number;
}

/** A shape moved off another keeps the shape clearance from flows as from shapes. */
export const OFF_A_SHAPE: PlacementTerms = { flowClearance: SHAPE_CLEARANCE };

/**
 * Where a node and its group may go in the draft: inside the frames it keeps
 * to, clear of every other shape and its label, and off every flow that is
 * not the group's own and its label, or clear of them by the terms' clearance.
 */
export class Placement {
    private readonly groupBounds: DiagramBounds;
    private readonly frameFit: FrameFit;
    private readonly obstacles: readonly DiagramBounds[];
    private readonly flows: ForeignFlows;
    private readonly flowClearance: number;

    constructor(
        draft: DrawingDraft,
        group: ShapeGroup,
        window: DiagramBounds,
        { into = [], flowClearance = 0 }: PlacementTerms = {},
    ) {
        const { node } = group;
        const members = new Set(group.members);
        this.flowClearance = flowClearance;
        this.groupBounds = groupBoundsIn(draft, group);
        this.frameFit = new FrameFit(draft, group, into);
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

    fits(offset: Offset): boolean {
        const box = translated(this.groupBounds, offset.dx, offset.dy);
        return (
            this.frameFit.fitsMovedBy(offset) &&
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
