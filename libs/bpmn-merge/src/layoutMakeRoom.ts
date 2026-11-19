import type { DrawingDraft } from "./layoutDrawingDraft";
import {
    type DiagramBounds,
    type Point,
    bottomOf,
    centerOf,
    keepsClearOf,
    liesWithin,
    rightOf,
    translated,
} from "./layoutGeometry";
import {
    FLOW_ENDS,
    type FlowEnd,
    type LayoutEdge,
    type LayoutModel,
    type LayoutShape,
    type NodeShape,
    drawnHostOf,
    drawnPoolOf,
    framesAroundOf,
    isFrame,
    translatedNode,
} from "./layoutModel";
import { type ShapeGroup, groupBoundsIn } from "./layoutShapeGroups";
import { FRAME_PADDING, SHAPE_CLEARANCE } from "./layoutShapePlacement";
import { introducedLayoutSpots } from "./layoutSpotDetection";
import { isFlowSpot, shapesOverlap } from "./layoutSpots";

/** How far right of the shape it lay on a moved shape lands, and how far what comes after it then keeps. */
const ROOM_GAP = 50;

export interface RoomMade {
    readonly draft: DrawingDraft;
    /** The outermost shapes that shifted to make room, in document order; none when the gap past the other shape already held the group. */
    readonly shifted: readonly string[];
}

/**
 * Makes room for the group right of the shape it lies on, as the modeler's
 * space tool does in the node's pool, or on its plane outside a pool: every
 * shape past a vertical line shifts right, every sub-process, lane and pool
 * across it grows, and the flows between shifting and staying shapes
 * stretch. The line lies past the other shape and before anything the moved
 * group would land on. Undefined when the other shape would have to shift
 * too, or the room breaks the drawing anywhere else: a shape on another,
 * outside its frame or off its host.
 */
export function makeRoom(
    draft: DrawingDraft,
    group: ShapeGroup,
    other: NodeShape,
): RoomMade | undefined {
    const { node } = group;
    const members = new Set(group.members);
    const outside = regionOf(draft, node).filter(({ id }) => !members.has(id));
    const region = outside.filter(({ id }) => !node.subProcesses.includes(id));
    const dx = rightOf(other.bounds) + ROOM_GAP - node.bounds.x;
    const target = translated(groupBoundsIn(draft, group), dx, 0);
    const line = lineBefore(draft, region, target, other);
    if (line === undefined) return undefined;

    const past = region.filter((shape) => shiftsPast(draft, shape, line));
    const space = spaceFor(draft, node, target, past, line, dx);
    const shifting = space > 0 ? past : [];
    const trial = draft.fork();
    if (shifting.length > 0) {
        shiftPast(draft, trial, { group, outside, shifting, line, space });
    }
    trial.translate(group, dx, 0);
    if (
        !breaksNothing(draft, trial) ||
        shapesOverlap(trial.node(node.id)!, trial.node(other.id)!)
    ) {
        return undefined;
    }
    const shiftingIds = new Set(shifting.map(({ id }) => id));
    const outermost = shifting.filter(
        (shape) =>
            !(shape.host !== undefined && shiftingIds.has(shape.host)) &&
            !shape.subProcesses.some((id) => shiftingIds.has(id)),
    );
    return { draft: trial, shifted: outermost.map(({ id }) => id) };
}

interface Shift {
    readonly group: ShapeGroup;
    /** The nodes of the group's region outside it. */
    readonly outside: readonly NodeShape[];
    readonly shifting: readonly NodeShape[];
    readonly line: number;
    readonly space: number;
}

/** Shifts the shapes past the line, grows the frames across it and stretches the flows between both. */
function shiftPast(draft: DrawingDraft, trial: DrawingDraft, shift: Shift): void {
    const { group, outside, shifting, line, space } = shift;
    const { node } = group;
    for (const shape of shifting) trial.replaceShape(translatedNode(shape, space, 0));
    for (const frame of [...outside, ...poolFramesOf(draft, node)]) {
        if (spans(frame, line)) trial.replaceShape(widened(frame, space));
    }
    const regionIds = new Set(outside.map(({ id }) => id));
    const shiftingIds = new Set(shifting.map(({ id }) => id));
    const ownEdges = new Set([...group.innerEdges, ...group.attachedEdges]);
    for (const edge of draft.edgesOn(node.plane)) {
        const between = FLOW_ENDS.every((at) => edge[at] !== undefined && regionIds.has(edge[at]));
        if (!between || ownEdges.has(edge.id)) continue;
        const endShifts = (end: FlowEnd) => {
            const shape = draft.node(edge[end]!)!;
            return spans(shape, line) ? undefined : shiftingIds.has(shape.id);
        };
        const stretched = stretchedPast(edge, line, space, endShifts);
        if (stretched !== edge) trial.replaceEdge(stretched);
    }
}

/** The nodes of the node's pool, or of its plane outside a pool, in document order. */
function regionOf(draft: DrawingDraft, node: NodeShape): NodeShape[] {
    const pool = drawnPoolOf(draft, node);
    return draft
        .nodesOn(node.plane)
        .filter((shape) => pool === undefined || shape.pool === pool.id);
}

/** The pool around the region and its lanes, or the lanes on a plane without a pool. */
function poolFramesOf(draft: DrawingDraft, node: NodeShape): LayoutShape[] {
    const pool = drawnPoolOf(draft, node);
    return [...draft.shapes.values()].filter(
        (shape) =>
            shape.plane === node.plane &&
            shape.kind !== "node" &&
            (pool === undefined
                ? shape.kind === "lane"
                : shape.id === pool.id ||
                  (shape.kind === "lane" && liesWithin(shape.bounds, pool.bounds))),
    );
}

/**
 * The line just past the other shape, moved left until every shape the
 * target would land on shifts out of its way; undefined when the other
 * shape would have to shift too.
 */
function lineBefore(
    draft: DrawingDraft,
    region: readonly NodeShape[],
    target: DiagramBounds,
    other: NodeShape,
): number | undefined {
    const otherShiftsFrom = shiftLineOf(draft, other);
    let line = rightOf(other.bounds) + 1;
    for (let step = 0; step <= region.length; step++) {
        const landedOn = region.filter(
            (shape) =>
                !shiftsPast(draft, shape, line) &&
                !keepsClearOf(target, shape.bounds, SHAPE_CLEARANCE),
        );
        if (landedOn.length === 0) return line;
        line = Math.min(...landedOn.map((shape) => shiftLineOf(draft, shape)));
        if (line <= otherShiftsFrom) return undefined;
    }
    return undefined;
}

/** Where a line must lie for the shape to shift: a boundary event goes with its host, a sub-process by its left side. */
function shiftLineOf(draft: DrawingDraft, shape: NodeShape): number {
    const host = drawnHostOf(draft, shape);
    if (host !== undefined) return shiftLineOf(draft, host);
    return shape.expanded ? shape.bounds.x : centerOf(shape.bounds).x;
}

/**
 * Whether the shape shifts with the line: a sub-process drawn open when it
 * lies wholly past it, another node when its center does, and a boundary
 * event with its host, or by its center on a host that grows.
 */
function shiftsPast(draft: DrawingDraft, shape: NodeShape, line: number): boolean {
    const host = drawnHostOf(draft, shape);
    if (host !== undefined) {
        return (
            shiftsPast(draft, host, line) || (spans(host, line) && centerOf(shape.bounds).x >= line)
        );
    }
    return shape.expanded ? shape.bounds.x >= line : centerOf(shape.bounds).x >= line;
}

/** Whether a frame, a pool, lane or sub-process drawn open, lies across the line and so grows. */
function spans(shape: LayoutShape, line: number): boolean {
    return isFrame(shape) && shape.bounds.x < line && line < rightOf(shape.bounds);
}

/**
 * How far the shapes past the line shift: enough that those level with the
 * target keep the gap from it, and that every frame of the node across the
 * line holds it.
 */
function spaceFor(
    draft: DrawingDraft,
    node: NodeShape,
    target: DiagramBounds,
    shifting: readonly NodeShape[],
    line: number,
    dx: number,
): number {
    const level = shifting.filter(
        ({ bounds }) =>
            bounds.y < bottomOf(target) + SHAPE_CLEARANCE &&
            bottomOf(bounds) > target.y - SHAPE_CLEARANCE,
    );
    const movedNode = translated(node.bounds, dx, 0);
    const frames = framesAroundOf(draft, node).filter(
        (frame) => spans(frame, line) && liesWithin(node.bounds, frame.bounds),
    );
    return Math.max(
        0,
        ...level.map(({ bounds }) => rightOf(target) + ROOM_GAP - bounds.x),
        ...frames.map((frame) => rightOf(movedNode) + FRAME_PADDING - rightOf(frame.bounds)),
    );
}

function widened<Shape extends LayoutShape>(shape: Shape, space: number): Shape {
    return { ...shape, bounds: { ...shape.bounds, width: shape.bounds.width + space } };
}

/**
 * The edge with its waypoints past the line shifted, by vertical runs so
 * every segment keeps its direction; the run at an end goes with the end's
 * shape when that shifts or stays whole. Its label shifts when its center
 * lies past the line.
 */
function stretchedPast(
    edge: LayoutEdge,
    line: number,
    space: number,
    endShifts: (end: FlowEnd) => boolean | undefined,
): LayoutEdge {
    const points = edge.waypoints;
    const last = points.length - 1;
    const runs = verticalRunsOf(points);
    const shifts = runs.map(({ from, to }) => {
        const byEnd =
            (from === 0 ? endShifts("source") : undefined) ??
            (to === last ? endShifts("target") : undefined);
        return byEnd ?? points[from]!.x >= line;
    });
    if (!shifts.includes(true)) return edge;
    const waypoints = runs.flatMap(({ from, to }, run) =>
        points
            .slice(from, to + 1)
            .map((point) => (shifts[run] ? { x: point.x + space, y: point.y } : point)),
    );
    const label =
        edge.label !== undefined && centerOf(edge.label).x >= line
            ? translated(edge.label, space, 0)
            : edge.label;
    return label === undefined ? { ...edge, waypoints } : { ...edge, waypoints, label };
}

/** The index ranges of consecutive waypoints on one vertical line. */
function verticalRunsOf(
    points: readonly Point[],
): { readonly from: number; readonly to: number }[] {
    const runs: { from: number; to: number }[] = [];
    points.forEach((point, at) => {
        const current = runs[runs.length - 1];
        if (current !== undefined && points[current.to]!.x === point.x) current.to = at;
        else runs.push({ from: at, to: at });
    });
    return runs;
}

/** Whether the trial has no shape spot the draft lacks: no new overlap, shape outside its frame or event off its host. */
function breaksNothing(draft: LayoutModel, trial: LayoutModel): boolean {
    return introducedLayoutSpots(trial, [draft]).every(isFlowSpot);
}
