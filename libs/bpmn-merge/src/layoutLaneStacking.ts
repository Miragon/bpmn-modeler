import { type DiagramBounds, bottomOf, liesWithin, translated } from "./layoutGeometry";
import {
    type FlowEnd,
    type LaneShape,
    type LayoutEdge,
    type LayoutModel,
    type LayoutShape,
    translatedEdge,
    translatedNode,
} from "./layoutModel";
import { lanesOverlap } from "./layoutSpots";

export interface LaneStacking {
    readonly lane: string;
    /** The pool, then the parent lanes from the innermost, that grew to hold the lane. */
    readonly grown: readonly string[];
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
    /** The inserted lane, its child lanes and the shapes drawn as their members, which stay where they lie. */
    readonly staying: ReadonlySet<string>;
}

/**
 * Moves each appended lane that its pool's lanes do not hold below its
 * siblings, in the order given, at its own height: one that lies on a
 * sibling or outside its parent lane or pool. Its child lanes go with it.
 * The pool and the parent lanes grow to hold it, and what lies below the
 * band shifts down with the flows to it, as the modeler's space tool does;
 * another pool across the band keeps its place and contents. The lane's
 * members stay where they lie; the container repair brings them into the
 * lane.
 */
export function stackAppendedLanes(
    layout: LayoutModel,
    appendedLanes: readonly string[],
): LaneStackPlan {
    const shapes = new Map(layout.shapes);
    const drawing: EditableDrawing = { shapes, edges: new Map(layout.edges) };
    const unstacked = new Set(appendedLanes);
    const carried = new Set<string>();
    const stacked: LaneStacking[] = [];
    for (const id of appendedLanes) {
        unstacked.delete(id);
        const lane = shapes.get(id);
        if (carried.has(id) || lane?.kind !== "lane" || lane.pool === undefined) continue;
        const pool = shapes.get(lane.pool);
        const siblings = siblingsOf(drawing, lane).filter(({ id }) => !unstacked.has(id));
        if (pool?.kind !== "pool" || pool.plane !== lane.plane || siblings.length === 0) continue;
        const overlapped = siblings.filter((sibling) => lanesOverlap(lane, sibling));
        const frame = shapes.get(lane.parent)?.kind === "lane" ? shapes.get(lane.parent)! : pool;
        if (overlapped.length === 0 && liesWithin(lane.bounds, frame.bounds)) continue;

        const line = Math.max(...siblings.map(({ bounds }) => bottomOf(bounds)));
        const childLanes = descendantLanesOf(drawing, lane);
        const grown = [pool.id, ...parentLanesOf(drawing, lane)];
        const shifted = openBand(drawing, {
            plane: lane.plane,
            line,
            height: lane.bounds.height,
            growing: new Set(grown),
            staying: membersOf(drawing, [lane, ...childLanes]),
        });
        const { x, width } = siblings[0]!.bounds;
        const place = { x, y: line, width, height: lane.bounds.height };
        for (const child of childLanes) {
            shapes.set(child.id, {
                ...child,
                bounds: carriedWith(child.bounds, lane.bounds, place),
            });
            carried.add(child.id);
        }
        shapes.set(id, { ...lane, bounds: place });
        stacked.push({
            lane: id,
            grown,
            overlapped: overlapped.map((sibling) => sibling.id),
            shifted: outermostOf(shifted),
        });
    }
    return stacked.length === 0 ? { layout, stacked } : { layout: drawing, stacked };
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

/** The lanes inside the lane at any depth, in document order. */
function descendantLanesOf(layout: LayoutModel, lane: LaneShape): LaneShape[] {
    const lanes = [...layout.shapes.values()].filter(
        (shape): shape is LaneShape => shape.kind === "lane" && shape.plane === lane.plane,
    );
    return lanes.filter((candidate) => parentLanesOf(layout, candidate).includes(lane.id));
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

/** Opens the band and returns the shapes it shifted down, in document order. */
function openBand(drawing: EditableDrawing, band: Band): LayoutShape[] {
    const anchored = poolsAcross(drawing, band);
    const shifted: LayoutShape[] = [];
    for (const shape of drawing.shapes.values()) {
        if (shape.plane !== band.plane || band.staying.has(shape.id)) continue;
        if (band.growing.has(shape.id)) {
            drawing.shapes.set(shape.id, { ...shape, bounds: grown(shape.bounds, band.height) });
        } else if (shape.bounds.y >= band.line && !liesInAny(shape, anchored)) {
            shifted.push(shape);
            drawing.shapes.set(
                shape.id,
                shape.kind === "node"
                    ? translatedNode(shape, 0, band.height)
                    : { ...shape, bounds: translated(shape.bounds, 0, band.height) },
            );
        }
    }
    const shiftedIds = new Set(shifted.map(({ id }) => id));
    for (const edge of drawing.edges.values()) {
        if (edge.plane !== band.plane) continue;
        const sourceShifts = edge.source !== undefined && shiftedIds.has(edge.source);
        const targetShifts = edge.target !== undefined && shiftedIds.has(edge.target);
        if (sourceShifts && targetShifts) {
            drawing.edges.set(edge.id, translatedEdge(edge, 0, band.height));
        } else if (sourceShifts || targetShifts) {
            drawing.edges.set(edge.id, stretched(edge, band, sourceShifts ? "target" : "source"));
        }
    }
    return shifted;
}

/** The pools across the line that do not grow: they keep their place, and what lies in them stays. */
function poolsAcross(layout: LayoutModel, band: Band): LayoutShape[] {
    return [...layout.shapes.values()].filter(
        (shape) =>
            shape.kind === "pool" &&
            shape.plane === band.plane &&
            !band.growing.has(shape.id) &&
            shape.bounds.y < band.line &&
            band.line < bottomOf(shape.bounds),
    );
}

function liesInAny(shape: LayoutShape, pools: readonly LayoutShape[]): boolean {
    return pools.some(
        (pool) =>
            (shape.kind !== "pool" && shape.pool === pool.id) ||
            liesWithin(shape.bounds, pool.bounds),
    );
}

/** The shifted shapes that did not shift with their pool, parent lane, host or sub-process. */
function outermostOf(shifted: readonly LayoutShape[]): string[] {
    const ids = new Set(shifted.map(({ id }) => id));
    const carriers = (shape: LayoutShape): (string | undefined)[] => {
        if (shape.kind === "pool") return [];
        if (shape.kind === "lane") return [shape.pool, shape.parent];
        return [shape.pool, shape.host, ...shape.subProcesses];
    };
    return shifted
        .filter((shape) => !carriers(shape).some((id) => id !== undefined && ids.has(id)))
        .map(({ id }) => id);
}

function grown(bounds: DiagramBounds, height: number): DiagramBounds {
    return { ...bounds, height: bounds.height + height };
}

/**
 * The edge with its points and label below the line shifted down, so its
 * runs across the line stretch; the point at the end that stays keeps its
 * place.
 */
function stretched(edge: LayoutEdge, { line, height }: Band, staying: FlowEnd): LayoutEdge {
    const kept = staying === "source" ? 0 : edge.waypoints.length - 1;
    const waypoints = edge.waypoints.map((point, at) =>
        point.y >= line && at !== kept ? { x: point.x, y: point.y + height } : point,
    );
    const label =
        edge.label !== undefined && edge.label.y >= line
            ? translated(edge.label, 0, height)
            : edge.label;
    return label === undefined ? { ...edge, waypoints } : { ...edge, waypoints, label };
}
