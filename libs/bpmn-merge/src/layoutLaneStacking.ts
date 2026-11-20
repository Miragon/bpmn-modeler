import type { MergeNonEmptyIds } from "@miragon/bpmn-modeler-types/mergeBuildNotes";

import { DrawingDraft } from "./layoutDrawingDraft";
import { type DiagramBounds, bottomOf, liesWithin } from "./layoutGeometry";
import { descendantLanesOf, lanesOf, parentLanesOf, siblingLanesOf } from "./layoutFrames";
import type { LaneShape, LayoutModel, LayoutShape } from "./layoutModel";
import { ShapeGroups } from "./layoutShapeGroups";
import { SpaceTool } from "./layoutSpaceTool";
import { lanesOverlap } from "./layoutSpots";

export interface LaneStacking {
    readonly lane: string;
    /** The pool, then the parent lanes from the innermost, that grew to hold the lane. */
    readonly grown: MergeNonEmptyIds;
    /** The sibling lanes it lay on as the build assembled the drawing. */
    readonly overlapped: readonly string[];
    /** The shapes that shifted down on their own, not with their pool, parent lane, host or sub-process, in document order. */
    readonly shifted: readonly string[];
}

export interface LaneStackPlan {
    /** The drawing with the lanes stacked; the input itself when none moved. */
    readonly layout: LayoutModel;
    readonly stacked: readonly LaneStacking[];
}

/** A band of `height` opened at `line` across the pool's plane: what lies below it shifts down, the pool and parent lanes grow. */
interface LaneBand {
    readonly pool: LayoutShape;
    readonly line: number;
    readonly height: number;
    /** The lanes and the pool around the inserted lane, which grow to hold it. */
    readonly growing: ReadonlySet<string>;
    /** The inserted lane, its child lanes and the shapes drawn as their members, which stay where they lie unless their host or sub-process shifts. */
    readonly staying: ReadonlySet<string>;
}

/**
 * Moves each appended lane that its pool's lanes do not hold below its
 * siblings, in the order given, at its own height: one that lies on a
 * sibling or outside its parent lane or pool. Its child lanes go with it.
 * The pool and the parent lanes grow to hold it, and what lies below the
 * band shifts down with the flows to it, by the space tool's rules; another
 * pool across the band keeps its place with what it holds, as it starts
 * above the line. The lane's members stay where they lie, unless their host
 * or sub-process shifts; the container repair brings them into the lane.
 */
export function stackAppendedLanes(
    layout: LayoutModel,
    appendedLanes: readonly string[],
): LaneStackPlan {
    if (appendedLanes.length === 0) return { layout, stacked: [] };
    const drawing = DrawingDraft.of(layout);
    const { shapes } = drawing;
    const groups = new ShapeGroups(layout);
    const unstacked = new Set(appendedLanes);
    const carried = new Set<string>();
    const stacked: LaneStacking[] = [];
    for (const id of appendedLanes) {
        unstacked.delete(id);
        const lane = shapes.get(id);
        if (carried.has(id) || lane?.kind !== "lane" || lane.pool === undefined) continue;
        const pool = shapes.get(lane.pool);
        const siblings = siblingLanesOf(drawing, lane).filter(({ id }) => !unstacked.has(id));
        if (pool?.kind !== "pool" || pool.plane !== lane.plane || siblings.length === 0) continue;
        const overlapped = siblings.filter((sibling) => lanesOverlap(lane, sibling));
        const frame = shapes.get(lane.parent)?.kind === "lane" ? shapes.get(lane.parent)! : pool;
        if (overlapped.length === 0 && liesWithin(lane.bounds, frame.bounds)) continue;

        const line = Math.max(...siblings.map(({ bounds }) => bottomOf(bounds)));
        const childLanes = descendantLanesOf(drawing, lane);
        const grown: MergeNonEmptyIds = [pool.id, ...parentLanesOf(drawing, lane)];
        const shifted = openBand(drawing, groups, {
            pool,
            line,
            height: lane.bounds.height,
            growing: new Set(grown),
            staying: membersOf(drawing, [lane, ...childLanes]),
        });
        const { x, width } = siblings[0]!.bounds;
        const place = { x, y: line, width, height: lane.bounds.height };
        for (const child of childLanes) {
            drawing.replaceShape({
                ...child,
                bounds: carriedWith(child.bounds, lane.bounds, place),
            });
            carried.add(child.id);
        }
        drawing.replaceShape({ ...lane, bounds: place });
        stacked.push({
            lane: id,
            grown,
            overlapped: overlapped.map((sibling) => sibling.id),
            shifted,
        });
    }
    return stacked.length === 0 ? { layout, stacked } : { layout: drawing, stacked };
}

/** Where a child lane lies when its parent moves from `from` to `to`: at the same offset, as much wider as the parent. */
function carriedWith(child: DiagramBounds, from: DiagramBounds, to: DiagramBounds): DiagramBounds {
    return {
        x: child.x + to.x - from.x,
        y: child.y + to.y - from.y,
        width: child.width + to.width - from.width,
        height: child.height,
    };
}

/** The lanes and the nodes in them, with the boundary events and contents of those nodes. */
function membersOf(layout: LayoutModel, lanes: readonly LaneShape[]): Set<string> {
    const laneIds = lanes.map(({ id }) => id);
    const members = new Set(laneIds);
    for (let grew = true; grew;) {
        grew = false;
        for (const shape of layout.shapes.values()) {
            if (shape.kind !== "node" || members.has(shape.id)) continue;
            const belongs =
                shape.lanes.some((lane) => laneIds.includes(lane)) ||
                (shape.host !== undefined && members.has(shape.host)) ||
                shape.subProcesses.some((id) => members.has(id));
            if (belongs) {
                members.add(shape.id);
                grew = true;
            }
        }
    }
    return members;
}

/**
 * Opens the band with the space tool over the pool's contents and the rest
 * of the plane, leaving what stays where it lies, and returns the outermost
 * shapes it shifted down, in document order.
 */
function openBand(drawing: DrawingDraft, groups: ShapeGroups, band: LaneBand): string[] {
    const { pool, staying } = band;
    const space = new SpaceTool(drawing.fork(), drawing, groups, "y");
    space.openBand({
        line: band.line,
        by: band.height,
        units: [
            ...space.unitsIn(pool.plane, pool, staying),
            ...space.unitsIn(pool.plane, undefined, new Set([pool.id, ...staying])),
        ],
        frames: [pool, ...lanesOf(drawing, pool).filter(({ id }) => !staying.has(id))],
        growing: band.growing,
    });
    space.stretchEdges(pool.plane, new Set(), band.line);
    return space.shifted;
}
