import { type DiagramBounds, bottomOf, translated } from "./layoutGeometry";
import {
    type LaneShape,
    type LayoutEdge,
    type LayoutModel,
    type LayoutShape,
    translatedEdge,
    translatedNode,
} from "./layoutModel";
import type { LayoutSpot } from "./layoutSpots";

export interface LaneStacking {
    readonly lane: string;
    /** The pool that grew to hold the lane. */
    readonly pool: string;
    /** The lanes it lay on as the build assembled the drawing. */
    readonly overlapped: readonly string[];
}

export interface LaneStackPlan {
    /** The drawing with the lanes stacked; the input itself when none moved. */
    readonly layout: LayoutModel;
    readonly stacked: readonly LaneStacking[];
}

interface EditableDrawing extends LayoutModel {
    readonly shapes: Map<string, LayoutShape>;
    readonly edges: Map<string, LayoutEdge>;
}

/** A band of `height` opened at `line`: what lies below it shifts down, what spans it grows. */
interface Band {
    readonly plane: string;
    readonly line: number;
    readonly height: number;
    /** The lanes and the pool around the inserted lane, which grow to hold it. */
    readonly growing: ReadonlySet<string>;
    /** The inserted lane and the shapes drawn as its members, which stay where they lie. */
    readonly staying: ReadonlySet<string>;
}

/**
 * Moves each appended lane that lies on a lane of its pool below its
 * siblings, in the order given, at its own height: the pool and the parent
 * lanes grow to hold it, and what lies below the band shifts down with the
 * flows to it, as the modeler's space tool does. The lane's members stay
 * where they lie; the container repair brings them into the lane.
 */
export function stackAppendedLanes(
    layout: LayoutModel,
    spots: readonly LayoutSpot[],
    appendedLanes: readonly string[],
): LaneStackPlan {
    const overlappedBy = overlappedLanesOf(spots, new Set(appendedLanes));
    if (overlappedBy.size === 0) return { layout, stacked: [] };
    const shapes = new Map(layout.shapes);
    const edges = new Map(layout.edges);
    const drawing: EditableDrawing = { shapes, edges };
    const unstacked = new Set(appendedLanes);
    const stacked: LaneStacking[] = [];
    for (const id of appendedLanes) {
        unstacked.delete(id);
        const overlapped = overlappedBy.get(id);
        const lane = shapes.get(id);
        if (overlapped === undefined || lane?.kind !== "lane" || lane.pool === undefined) continue;
        const pool = shapes.get(lane.pool);
        const siblings = siblingsOf(drawing, lane).filter(({ id }) => !unstacked.has(id));
        if (pool?.kind !== "pool" || pool.plane !== lane.plane || siblings.length === 0) continue;
        const line = Math.max(...siblings.map(({ bounds }) => bottomOf(bounds)));
        openBand(drawing, {
            plane: lane.plane,
            line,
            height: lane.bounds.height,
            growing: new Set([pool.id, ...parentLanesOf(drawing, lane)]),
            staying: membersOf(drawing, lane.id),
        });
        const { x, width } = siblings[0]!.bounds;
        shapes.set(id, { ...lane, bounds: { x, y: line, width, height: lane.bounds.height } });
        stacked.push({ lane: id, pool: pool.id, overlapped });
    }
    return stacked.length === 0 ? { layout, stacked } : { layout: drawing, stacked };
}

/** The lanes each appended lane lies on, by the overlaps found: the other lane of each overlap with an appended one. */
function overlappedLanesOf(
    spots: readonly LayoutSpot[],
    appended: ReadonlySet<string>,
): Map<string, string[]> {
    const overlappedBy = new Map<string, string[]>();
    for (const spot of spots) {
        if (spot.kind !== "lanesOverlap") continue;
        const moved = spot.lanes.find((id) => appended.has(id));
        const other = spot.lanes.find((id) => id !== moved);
        if (moved === undefined || other === undefined) continue;
        overlappedBy.set(moved, [...(overlappedBy.get(moved) ?? []), other]);
    }
    return overlappedBy;
}

function siblingsOf(layout: LayoutModel, lane: LaneShape): LaneShape[] {
    return [...layout.shapes.values()].filter(
        (shape): shape is LaneShape =>
            shape.kind === "lane" &&
            shape.id !== lane.id &&
            shape.plane === lane.plane &&
            shape.parent === lane.parent,
    );
}

function parentLanesOf(layout: LayoutModel, lane: LaneShape): string[] {
    const parents: string[] = [];
    for (let parent = layout.shapes.get(lane.parent); parent?.kind === "lane";) {
        if (parents.includes(parent.id)) break;
        parents.push(parent.id);
        parent = layout.shapes.get(parent.parent);
    }
    return parents;
}

/** The lane and the nodes in it, with the boundary events and contents of those nodes. */
function membersOf(layout: LayoutModel, lane: string): Set<string> {
    const members = new Set([lane]);
    for (let grew = true; grew;) {
        grew = false;
        for (const shape of layout.shapes.values()) {
            if (shape.kind !== "node" || members.has(shape.id)) continue;
            const belongs =
                shape.lanes.includes(lane) ||
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

function openBand(drawing: EditableDrawing, band: Band): void {
    const shifted = new Set<string>();
    for (const shape of drawing.shapes.values()) {
        if (shape.plane !== band.plane || band.staying.has(shape.id)) continue;
        if (band.growing.has(shape.id)) {
            drawing.shapes.set(shape.id, { ...shape, bounds: grown(shape.bounds, band.height) });
        } else if (shape.bounds.y >= band.line) {
            shifted.add(shape.id);
            drawing.shapes.set(
                shape.id,
                shape.kind === "node"
                    ? translatedNode(shape, 0, band.height)
                    : { ...shape, bounds: translated(shape.bounds, 0, band.height) },
            );
        }
    }
    for (const edge of drawing.edges.values()) {
        if (edge.plane !== band.plane) continue;
        const shifting = [edge.source, edge.target].filter(
            (end) => end !== undefined && shifted.has(end),
        ).length;
        if (shifting === 2) drawing.edges.set(edge.id, translatedEdge(edge, 0, band.height));
        if (shifting === 1) drawing.edges.set(edge.id, stretched(edge, band));
    }
}

function grown(bounds: DiagramBounds, height: number): DiagramBounds {
    return { ...bounds, height: bounds.height + height };
}

/** The edge with its points and label below the line shifted down, so its runs across the line stretch. */
function stretched(edge: LayoutEdge, { line, height }: Band): LayoutEdge {
    const waypoints = edge.waypoints.map((point) =>
        point.y >= line ? { x: point.x, y: point.y + height } : point,
    );
    const label =
        edge.label !== undefined && edge.label.y >= line
            ? translated(edge.label, 0, height)
            : edge.label;
    return label === undefined ? { ...edge, waypoints } : { ...edge, waypoints, label };
}
