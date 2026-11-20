import {
    type Axis,
    along,
    boundsShifted,
    farBorderOf,
    farSideOf,
    grownAlong,
    liesAheadWithin,
    nearSideOf,
    offsetAlong,
    stripPast,
} from "./layoutAxis";
import type { DrawingDraft } from "./layoutDrawingDraft";
import type { FlowTopology } from "./layoutFlowTopology";
import { stretchedEdge } from "./layoutEdgeStretch";
import {
    type DiagramBounds,
    bordersAt,
    bottomOf,
    boundsAround,
    centerOf,
    keepsClearOf,
    liesWithin,
    rightOf,
    translated,
} from "./layoutGeometry";
import {
    type LaneShape,
    type LayoutShape,
    type NodeShape,
    drawnHostOf,
    drawnPartsOf,
    drawnPoolOf,
    innermostFrameOf,
    innermostLaneOf,
    lanesOf,
    translatedNode,
} from "./layoutModel";
import { type ShapeGroups, groupBoundsIn } from "./layoutShapeGroups";
import { FRAME_PADDING, SHAPE_CLEARANCE } from "./layoutShapePlacement";

/** How far what a room pushes keeps from what pushed it: in line along x, stacked along y. */
export const ROOM_GAP = 50;
export const STACK_GAP = 40;

/** Room asked for a box in the frame a shape lies in. */
export interface RoomRequest {
    /** What must lie clear of everything that may give way. */
    readonly box: DiagramBounds;
    /** Only what lies at or past it along the axis gives way; a frame by its near side, a node by its center. */
    readonly line: number;
    /**
     * The parts of the shape a stacked group lies under, which give way as
     * one with the box: what overlaps them gives way too, with no clearance,
     * as both sides drew what lies merely near them.
     */
    readonly column?: readonly DiagramBounds[];
    /** How far back the line may move to take in what the box lands on before it. */
    readonly floor?: number;
    /** What never gives way nor stands in the way: the moved group, or a frame that grows. */
    readonly exclude: ReadonlySet<string>;
    /** What never gives way in the box's own frame but stands in the way of a frame growing around it: the shape the group lay on. */
    readonly stays?: ReadonlySet<string>;
    /**
     * Set when the box is the strip a frame gains by growing, to how far it
     * grew: what the strip lands on shifts that far, and only what lies
     * across from it along the axis counts, as the frame lay beside the rest
     * before it grew.
     */
    readonly frameGrowth?: number;
}

/** A node with everything that moves with it, or a pool with its lanes and contents: what gives way as one. */
interface Unit {
    readonly id: string;
    readonly bounds: DiagramBounds;
    readonly lead: number;
    readonly nodes: readonly string[];
    readonly frames: readonly string[];
}

interface FrameRequest extends RoomRequest {
    readonly plane: string;
    /** The innermost sub-process or pool the box lies in; none on a plane outside a pool. */
    readonly container: LayoutShape | undefined;
    /** The innermost lane the box lies in, which room below grows. */
    readonly lane: LaneShape | undefined;
}

/**
 * Makes room in a trial along one axis, as a modeller would with the space
 * tool held over just what is in the way: only what the box lands on gives
 * way, with what that then lands on and the shapes in line after it that its
 * flows lead to, all by one shift. A frame that no longer holds what lies in
 * it grows, keeping the margin it had, and its new strip is room asked of
 * the frame around it, up to the pools on the plane. Room below in a pool
 * with lanes grows the lane, so what lies under it shifts down.
 */
export class RoomPush {
    /** How far each shifted node and frame went along the axis. */
    private readonly shift = new Map<string, number>();
    private readonly shiftedUnits = new Set<string>();

    constructor(
        private readonly before: DrawingDraft,
        private readonly trial: DrawingDraft,
        private readonly groups: ShapeGroups,
        private readonly topology: FlowTopology,
        private readonly axis: Axis,
    ) {}

    /** Makes room for the request in the frame `at` lies in; false when something before the line is in the way. */
    push(at: NodeShape, request: RoomRequest): boolean {
        return this.roomIn({
            ...request,
            plane: at.plane,
            container: innermostFrameOf(this.trial, at),
            lane: innermostLaneOf(this.trial, at),
        });
    }

    /** The outermost shapes that gave way, pools among them, in document order. */
    get shifted(): string[] {
        return [...this.before.shapes.keys()].filter((id) => this.shiftedUnits.has(id));
    }

    /** Every shape that moved, frames among them. */
    get moved(): string[] {
        return [...this.shift.keys()];
    }

    /**
     * Moves each edge between shapes that shifted alike with them and
     * stretches each edge between shapes that shifted differently by runs
     * across the axis, so its segments keep their direction. The edges left
     * out are re-routed by the flow repair.
     */
    stretchEdges(plane: string, leftOut: ReadonlySet<string>): void {
        for (const edge of this.before.edgesOn(plane)) {
            if (leftOut.has(edge.id) || edge.waypoints.length === 0) continue;
            const bySource = edge.source === undefined ? 0 : (this.shift.get(edge.source) ?? 0);
            const byTarget = edge.target === undefined ? 0 : (this.shift.get(edge.target) ?? 0);
            if (bySource !== 0 || byTarget !== 0) {
                this.trial.replaceEdge(
                    stretchedEdge(this.before, edge, this.axis, bySource, byTarget),
                );
            }
        }
    }

    private roomIn(request: FrameRequest): boolean {
        const { container, lane, stays = new Set() } = request;
        const units = this.unitsIn(request.plane, container, request.exclude).filter(
            ({ id }) => !stays.has(id),
        );
        const inLane =
            this.axis === "y" && lane !== undefined
                ? units.filter(({ id }) => this.trial.node(id)?.lanes.includes(lane.id))
                : units;
        const pushed = this.pushedBy(inLane, request);
        if (pushed === undefined) return false;
        for (const unit of pushed.units) this.shiftUnit(unit, pushed.by);
        const extent = Math.max(
            this.far(request.box),
            ...pushed.units.map((unit) => this.far(unit.bounds) + pushed.by),
        );
        if (container?.kind === "node") {
            return this.growSubProcess(
                request,
                container,
                extent + this.marginOf(container, units),
            );
        }
        if (lane === undefined && container === undefined) return true;
        const pool = container && this.trial.shapes.get(container.id)!;
        const lanes = this.lanesWith(pool, lane);
        const before = boundsAround(
            [...(pool ? [pool] : []), ...lanes].map(({ bounds }) => bounds),
        );
        const growth =
            this.axis === "y" && lane !== undefined
                ? this.growLane(
                      pool,
                      this.trial.shapes.get(lane.id) as LaneShape,
                      lanes,
                      extent + this.marginOf(lane, inLane),
                      units,
                  )
                : this.growFrame(
                      pool ?? lane!,
                      lanes,
                      extent + this.marginOf(pool ?? lane!, units),
                  );
        if (growth <= 0) return true;
        const made = this.roomIn({
            plane: request.plane,
            container: undefined,
            lane: undefined,
            box: stripPast(this.axis, before, growth),
            line: this.far(before),
            exclude: new Set([...request.exclude, ...(pool ? [pool.id] : [])]),
            frameGrowth: growth,
        });
        if (made && this.axis === "y" && pool !== undefined) {
            this.growLevelPools(pool, before, growth);
        }
        return made;
    }

    /**
     * Grows each other pool on the plane that ended level with the pool by
     * as much, with its lanes across its far side, where the strip it gains
     * lands on nothing: the space tool held over the plane keeps them level.
     */
    private growLevelPools(pool: LayoutShape, before: DiagramBounds, growth: number): void {
        const units = this.unitsIn(pool.plane, undefined, new Set([pool.id]));
        for (const other of units) {
            const shape = this.trial.shapes.get(other.id)!;
            if (shape.kind !== "pool" || Math.abs(this.far(shape.bounds) - this.far(before)) > 1) {
                continue;
            }
            const strip = stripPast(this.axis, shape.bounds, growth);
            const landsOnSome = units.some(
                (unit) =>
                    unit.id !== other.id &&
                    liesAheadWithin(
                        this.axis,
                        strip,
                        this.trial.shapes.get(unit.id)!.bounds,
                        SHAPE_CLEARANCE,
                    ),
            );
            if (!landsOnSome) {
                this.growFrame(shape, lanesOf(this.trial, shape), this.far(shape.bounds) + growth);
            }
        }
    }

    /** Grows the sub-process to reach the far side, and asks its own frame for the strip it gains. */
    private growSubProcess(request: FrameRequest, container: NodeShape, farSide: number): boolean {
        const frame = this.trial.shapes.get(container.id)!;
        const growth = this.growFrame(frame, [], farSide);
        if (growth <= 0) return true;
        const grown = this.trial.node(frame.id)!;
        return this.roomIn({
            plane: request.plane,
            container: innermostFrameOf(this.trial, grown),
            lane: innermostLaneOf(this.trial, grown),
            box: stripPast(this.axis, frame.bounds, growth),
            line: this.far(frame.bounds),
            exclude: new Set([...request.exclude, frame.id]),
            frameGrowth: growth,
        });
    }

    /** The lanes of the pool, or on a plane without a pool the lanes beside the lane. */
    private lanesWith(pool: LayoutShape | undefined, lane: LaneShape | undefined): LaneShape[] {
        if (pool !== undefined) return lanesOf(this.trial, pool);
        return [...this.trial.shapes.values()].filter(
            (shape): shape is LaneShape =>
                shape.kind === "lane" && shape.plane === lane?.plane && shape.pool === undefined,
        );
    }

    /**
     * What gives way to the box: each unit at or past the line it lands on
     * or that overlaps the column, past the far side of what it met, then
     * each it lands on in turn and each in line after it that its flows
     * lead to and that would come nearer than the room gap, all by one shift.
     * Undefined when a unit before the line lies where the box goes, or where
     * a unit that gives way goes.
     */
    private pushedBy(
        units: readonly Unit[],
        request: FrameRequest,
    ): { readonly units: Unit[]; readonly by: number } | undefined {
        const { box, floor, frameGrowth, column = [] } = request;
        const lands = (on: DiagramBounds, unit: Unit) =>
            !keepsClearOf(on, unit.bounds, SHAPE_CLEARANCE);
        const reachesBox = (unit: Unit) =>
            frameGrowth === undefined
                ? lands(box, unit)
                : liesAheadWithin(this.axis, box, unit.bounds, SHAPE_CLEARANCE);
        const columnUnder = (unit: Unit) =>
            column.filter((part) => !keepsClearOf(part, unit.bounds, 0));
        const partsLandedOn = (unit: Unit) => [
            ...(reachesBox(unit) ? [box] : []),
            ...columnUnder(unit),
        ];
        let line = request.line;
        let blocking = units.filter((unit) => unit.lead < line && reachesBox(unit));
        while (blocking.length > 0) {
            line = Math.min(...blocking.map(({ lead }) => lead));
            if (floor === undefined || line <= floor) return undefined;
            blocking = units.filter((unit) => unit.lead < line && reachesBox(unit));
        }
        const past = units.filter((unit) => unit.lead >= line);
        const hit = past.filter((unit) => partsLandedOn(unit).length > 0);
        const by =
            frameGrowth ??
            Math.max(
                0,
                ...hit.map(
                    (unit) =>
                        Math.max(...partsLandedOn(unit).map((on) => this.far(on))) +
                        this.gap -
                        this.near(unit.bounds),
                ),
            );
        if (hit.length === 0 || by <= 0) return { units: [], by: 0 };
        const pushed = new Set(hit);
        const queue = [...hit];
        while (queue.length > 0) {
            const unit = queue.pop()!;
            const landed = boundsShifted(this.axis, unit.bounds, by);
            for (const next of past) {
                if (pushed.has(next)) continue;
                if (lands(landed, next) || this.keptInLineAfter(unit, next, by)) {
                    pushed.add(next);
                    queue.push(next);
                }
            }
        }
        const staying = units.filter((unit) => unit.lead < line);
        const landsOnStaying = [...pushed].some((unit) =>
            staying.some((other) => lands(boundsShifted(this.axis, unit.bounds, by), other)),
        );
        return landsOnStaying ? undefined : { units: [...pushed], by };
    }

    /** Whether `next` is a shape `unit` flows into, in line after it, that the shift would bring nearer than the room gap. */
    private keptInLineAfter(unit: Unit, next: Unit, by: number): boolean {
        if (this.axis !== "x" || !this.topology.followersOf(unit.id).has(next.id)) return false;
        const inRow =
            unit.bounds.y < bottomOf(next.bounds) && next.bounds.y < bottomOf(unit.bounds);
        const gap = next.bounds.x - rightOf(unit.bounds);
        return inRow && gap >= 0 && gap - by < Math.min(ROOM_GAP, gap);
    }

    /** The units directly in the container: its nodes with what moves with them, and on a plane outside a pool also its pools. */
    private unitsIn(
        plane: string,
        container: LayoutShape | undefined,
        exclude: ReadonlySet<string>,
    ): Unit[] {
        const { trial } = this;
        const nodes = trial
            .nodesOn(plane)
            .filter(
                (node) =>
                    !exclude.has(node.id) &&
                    drawnHostOf(trial, node) === undefined &&
                    innermostFrameOf(trial, node)?.id === container?.id,
            )
            .map((node): Unit => {
                const group = this.groups.of(trial, node);
                const bounds = groupBoundsIn(trial, group);
                return {
                    id: node.id,
                    bounds,
                    lead: this.leadOf(node),
                    nodes: group.members,
                    frames: [],
                };
            });
        if (container !== undefined) return nodes;
        const pools = [...trial.shapes.values()]
            .filter(
                (shape) => shape.kind === "pool" && shape.plane === plane && !exclude.has(shape.id),
            )
            .map((pool): Unit => ({
                id: pool.id,
                bounds: pool.bounds,
                lead: this.near(pool.bounds),
                nodes: trial
                    .nodesOn(plane)
                    .filter((node) => drawnPoolOf(trial, node)?.id === pool.id)
                    .map(({ id }) => id),
                frames: [pool.id, ...lanesOf(trial, pool).map(({ id }) => id)],
            }));
        return [...nodes, ...pools];
    }

    private shiftUnit(unit: Unit, by: number): void {
        for (const id of unit.nodes) {
            const node = this.trial.node(id);
            if (node !== undefined) this.moveShape(node, by);
        }
        for (const id of unit.frames) this.moveShape(this.trial.shapes.get(id)!, by);
        this.shiftedUnits.add(unit.id);
    }

    private moveShape(shape: LayoutShape, by: number): void {
        const { dx, dy } = offsetAlong(this.axis, by);
        this.trial.replaceShape(
            shape.kind === "node"
                ? translatedNode(shape, dx, dy)
                : { ...shape, bounds: translated(shape.bounds, dx, dy) },
        );
        this.shift.set(shape.id, (this.shift.get(shape.id) ?? 0) + by);
    }

    /**
     * How far the frame kept what lies in it from its far side before the
     * room was made, which it keeps when it grows: at least the frame
     * padding, at most the gap the room keeps.
     */
    private marginOf(frame: LayoutShape, units: readonly Unit[]): number {
        const { before } = this;
        const bounds = before.shapes.get(frame.id)?.bounds ?? frame.bounds;
        const ends = units.flatMap(({ id }) => {
            const shape = before.shapes.get(id);
            if (shape === undefined || !liesWithin(shape.bounds, bounds)) return [];
            return [
                this.far(shape.kind === "node" ? boundsAround(drawnPartsOf(shape)) : shape.bounds),
            ];
        });
        if (ends.length === 0) return FRAME_PADDING;
        const kept = this.far(bounds) - Math.max(...ends);
        return Math.min(this.gap, Math.max(FRAME_PADDING, kept));
    }

    /**
     * Grows the frame to reach the far side, with those of the lanes that
     * reach its far side and the boundary events on that side. Returns the
     * growth.
     */
    private growFrame(frame: LayoutShape, lanes: readonly LaneShape[], farSide: number): number {
        const growth = farSide - this.far(frame.bounds);
        if (growth <= 0) return 0;
        const side = farBorderOf(this.axis);
        const across = lanes.filter(
            (lane) =>
                lane.id !== frame.id &&
                Math.abs(this.far(lane.bounds) - this.far(frame.bounds)) <= 1,
        );
        const events = this.trial
            .nodesOn(frame.plane)
            .filter(
                (event) =>
                    event.host === frame.id &&
                    bordersAt(centerOf(event.bounds), frame.bounds).includes(side),
            );
        for (const shape of [frame, ...across]) this.trial.replaceShape(this.grown(shape, growth));
        for (const event of events) this.moveShape(event, growth);
        return growth;
    }

    /**
     * Grows the lane down to the far side: what lies under it shifts down,
     * the lanes across its bottom grow with it and so does the pool. Returns
     * the growth.
     */
    private growLane(
        pool: LayoutShape | undefined,
        lane: LaneShape,
        lanes: readonly LaneShape[],
        farSide: number,
        units: readonly Unit[],
    ): number {
        const growth = farSide - bottomOf(lane.bounds);
        if (growth <= 0) return 0;
        const line = bottomOf(lane.bounds);
        for (const unit of units) {
            if (unit.lead >= line && !this.shiftedUnits.has(unit.id)) this.shiftUnit(unit, growth);
        }
        for (const other of lanes) {
            if (other.bounds.y >= line) this.moveShape(other, growth);
            else if (bottomOf(other.bounds) >= line)
                this.trial.replaceShape(this.grown(other, growth));
        }
        if (pool !== undefined) this.trial.replaceShape(this.grown(pool, growth));
        return growth;
    }

    private grown<Shape extends LayoutShape>(shape: Shape, by: number): Shape {
        return { ...shape, bounds: grownAlong(this.axis, shape.bounds, by) };
    }

    private get gap(): number {
        return this.axis === "x" ? ROOM_GAP : STACK_GAP;
    }

    private leadOf(node: NodeShape): number {
        return leadAlong(this.axis, node);
    }

    private near(bounds: DiagramBounds): number {
        return nearSideOf(this.axis, bounds);
    }

    private far(bounds: DiagramBounds): number {
        return farSideOf(this.axis, bounds);
    }
}

/** Where a node lies along the axis: a sub-process drawn open by its near side, another node by its center. */
export function leadAlong(axis: Axis, node: NodeShape): number {
    return node.expanded ? nearSideOf(axis, node.bounds) : along(axis, centerOf(node.bounds));
}
