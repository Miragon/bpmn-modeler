import {
    type Axis,
    boundsShifted,
    endsLevelAlong,
    farSideOf,
    liesAheadWithin,
    nearSideOf,
    stripPast,
} from "./layoutAxis";
import type { DrawingDraft } from "./layoutDrawingDraft";
import type { FlowTopology } from "./layoutFlowTopology";
import {
    type DiagramBounds,
    bottomOf,
    boundsAround,
    keepsClearOf,
    liesWithin,
    rightOf,
} from "./layoutGeometry";
import {
    type LaneShape,
    type LayoutShape,
    type NodeShape,
    drawnPartsOf,
    innermostFrameOf,
    innermostLaneOf,
    lanesOf,
} from "./layoutModel";
import type { ShapeGroups } from "./layoutShapeGroups";
import { FRAME_PADDING, SHAPE_CLEARANCE } from "./layoutShapePlacement";
import { SpaceTool, type SpaceUnit } from "./layoutSpaceTool";

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

/** The frames room is asked in. */
export interface FrameScope {
    /** The innermost sub-process or pool the box lies in; none on a plane outside a pool. */
    readonly container: LayoutShape | undefined;
    /** The innermost lane the box lies in, none in a sub-process. */
    readonly lane: LaneShape | undefined;
}

interface FrameRequest extends RoomRequest, FrameScope {
    readonly plane: string;
}

/** The frame that grows when what lies in it no longer fits, by how it grows. */
export type GrowingFrame =
    | { readonly kind: "subProcess"; readonly subProcess: NodeShape }
    | {
          readonly kind: "laneDown";
          readonly lane: LaneShape;
          readonly pool: LayoutShape | undefined;
      }
    | { readonly kind: "pool"; readonly pool: LayoutShape; readonly keepsPoolsLevel: boolean }
    | { readonly kind: "planeLanes"; readonly lane: LaneShape }
    | { readonly kind: "plane" };

/**
 * Which frame room asked in the scope grows along the axis: the sub-process
 * it lies in; down a lane, the lane; else the pool, whose growth down the
 * pools level with it follow, or the lanes of a plane without a pool.
 */
export function growingFrameOf({ container, lane }: FrameScope, axis: Axis): GrowingFrame {
    if (container?.kind === "node") return { kind: "subProcess", subProcess: container };
    if (axis === "y" && lane !== undefined) return { kind: "laneDown", lane, pool: container };
    if (container !== undefined) {
        return { kind: "pool", pool: container, keepsPoolsLevel: axis === "y" };
    }
    if (lane !== undefined) return { kind: "planeLanes", lane };
    return { kind: "plane" };
}

/** What a push leaves in its frame: the units in it, those that might give way, and how far they and the box reach. */
interface PushedFrame {
    readonly units: readonly SpaceUnit[];
    readonly givingWay: readonly SpaceUnit[];
    readonly extent: number;
}

/** The strip a frame gained, asked of the frame around it, and the pool whose growth the pools level with it follow once it is made. */
interface OuterRoom {
    readonly request: FrameRequest;
    readonly levelWith?: LevelGrowth;
}

interface LevelGrowth {
    readonly pool: LayoutShape;
    readonly before: DiagramBounds;
    readonly growth: number;
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
    private readonly space: SpaceTool;

    constructor(
        private readonly before: DrawingDraft,
        private readonly trial: DrawingDraft,
        groups: ShapeGroups,
        private readonly topology: FlowTopology,
        private readonly axis: Axis,
    ) {
        this.space = new SpaceTool(before, trial, groups, axis);
    }

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
        return this.space.shifted;
    }

    /** Every shape that moved, frames among them. */
    get moved(): string[] {
        return this.space.moved;
    }

    /**
     * Moves each edge between shapes that shifted alike with them and
     * stretches each edge between shapes that shifted differently by runs
     * across the axis, so its segments keep their direction. The edges left
     * out are re-routed by the flow repair.
     */
    stretchEdges(plane: string, leftOut: ReadonlySet<string>): void {
        this.space.stretchEdges(plane, leftOut);
    }

    private roomIn(request: FrameRequest): boolean {
        const frame = growingFrameOf(request, this.axis);
        const { stays = new Set() } = request;
        const units = this.space
            .unitsIn(request.plane, request.container, request.exclude)
            .filter(({ id }) => !stays.has(id));
        const givingWay = this.mayGiveWay(frame, units);
        const extent = this.shiftWhatGivesWay(givingWay, request);
        if (extent === undefined) return false;
        const outer = this.grow(frame, request, { units, givingWay, extent });
        if (outer === undefined) return true;
        const made = this.roomIn(outer.request);
        if (made && outer.levelWith !== undefined) this.growLevelPools(outer.levelWith);
        return made;
    }

    /** The units that may give way: down a lane only those in it, as the lane's growth shifts the rest. */
    private mayGiveWay(frame: GrowingFrame, units: SpaceUnit[]): SpaceUnit[] {
        if (frame.kind !== "laneDown") return units;
        return units.filter(({ id }) => this.trial.node(id)?.lanes.includes(frame.lane.id));
    }

    /** Shifts what gives way to the request; how far it and the box reach, or undefined when something before the line is in the way. */
    private shiftWhatGivesWay(
        units: readonly SpaceUnit[],
        request: FrameRequest,
    ): number | undefined {
        const pushed = this.pushedBy(units, request);
        if (pushed === undefined) return undefined;
        for (const unit of pushed.units) this.space.shiftUnit(unit, pushed.by);
        return Math.max(
            this.far(request.box),
            ...pushed.units.map((unit) => this.far(unit.bounds) + pushed.by),
        );
    }

    /** Grows the frame to hold what the push reached with the margin it kept; the strip it gained, none when it did not grow. */
    private grow(
        frame: GrowingFrame,
        request: FrameRequest,
        pushed: PushedFrame,
    ): OuterRoom | undefined {
        switch (frame.kind) {
            case "subProcess":
                return this.growSubProcess(request, frame.subProcess, pushed);
            case "laneDown":
                return this.growLaneDown(request, frame.lane, frame.pool, pushed);
            case "pool":
                return this.growPool(request, frame.pool, frame.keepsPoolsLevel, pushed);
            case "planeLanes":
                return this.growPlaneLanes(request, frame.lane, pushed);
            case "plane":
                return undefined;
        }
    }

    /**
     * Grows each other pool on the plane that ended level with the pool by
     * as much, with its lanes across its far side, where the strip it gains
     * lands on nothing: the space tool held over the plane keeps them level.
     */
    private growLevelPools({ pool, before, growth }: LevelGrowth): void {
        const units = this.space.unitsIn(pool.plane, undefined, new Set([pool.id]));
        for (const other of units) {
            const shape = this.trial.shapes.get(other.id)!;
            if (shape.kind !== "pool" || !endsLevelAlong(this.axis, shape.bounds, before)) {
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
                this.space.growFrame(
                    shape,
                    lanesOf(this.trial, shape),
                    this.far(shape.bounds) + growth,
                );
            }
        }
    }

    /** Grows the sub-process, and asks its own frame for the strip it gains. */
    private growSubProcess(
        request: FrameRequest,
        subProcess: NodeShape,
        { units, extent }: PushedFrame,
    ): OuterRoom | undefined {
        const frame = this.trial.shapes.get(subProcess.id)!;
        const growth = this.space.growFrame(frame, [], extent + this.marginOf(subProcess, units));
        if (growth <= 0) return undefined;
        const grown = this.trial.node(frame.id)!;
        return {
            request: {
                plane: request.plane,
                container: innermostFrameOf(this.trial, grown),
                lane: innermostLaneOf(this.trial, grown),
                box: stripPast(this.axis, frame.bounds, growth),
                line: this.far(frame.bounds),
                exclude: new Set([...request.exclude, frame.id]),
                frameGrowth: growth,
            },
        };
    }

    /**
     * Grows the lane down: what lies under it shifts down, the lanes across
     * its bottom grow with it and so does the pool, whose strip the plane is
     * asked for and the pools level with it follow.
     */
    private growLaneDown(
        request: FrameRequest,
        lane: LaneShape,
        container: LayoutShape | undefined,
        { units, givingWay, extent }: PushedFrame,
    ): OuterRoom | undefined {
        const pool = container && this.trial.shapes.get(container.id)!;
        const lanes = pool ? lanesOf(this.trial, pool) : this.lanesBeside(lane);
        const before = boundsAround(
            [...(pool ? [pool] : []), ...lanes].map(({ bounds }) => bounds),
        );
        const line = bottomOf(this.trial.shapes.get(lane.id)!.bounds);
        const growth = extent + this.marginOf(lane, givingWay) - line;
        if (growth <= 0) return undefined;
        const across = lanes.filter(
            (other) => other.bounds.y < line && bottomOf(other.bounds) >= line,
        );
        this.space.openBand({
            line,
            by: growth,
            units,
            frames: [...lanes, ...(pool ? [pool] : [])],
            growing: new Set([...across, ...(pool ? [pool] : [])].map(({ id }) => id)),
        });
        return {
            request: this.planeStrip(request, before, growth, pool),
            levelWith: pool && { pool, before, growth },
        };
    }

    /** Grows the pool with its lanes across its far side, and asks the plane for the strip it gains. */
    private growPool(
        request: FrameRequest,
        container: LayoutShape,
        keepsPoolsLevel: boolean,
        { units, extent }: PushedFrame,
    ): OuterRoom | undefined {
        const pool = this.trial.shapes.get(container.id)!;
        const lanes = lanesOf(this.trial, pool);
        const before = boundsAround([pool, ...lanes].map(({ bounds }) => bounds));
        const growth = this.space.growFrame(pool, lanes, extent + this.marginOf(pool, units));
        if (growth <= 0) return undefined;
        return {
            request: this.planeStrip(request, before, growth, pool),
            levelWith: keepsPoolsLevel ? { pool, before, growth } : undefined,
        };
    }

    /** Grows the lanes of a plane without a pool across their far side, and asks the plane for the strip they gain. */
    private growPlaneLanes(
        request: FrameRequest,
        lane: LaneShape,
        { units, extent }: PushedFrame,
    ): OuterRoom | undefined {
        const lanes = this.lanesBeside(lane);
        const before = boundsAround(lanes.map(({ bounds }) => bounds));
        const growth = this.space.growFrame(lane, lanes, extent + this.marginOf(lane, units));
        if (growth <= 0) return undefined;
        return { request: this.planeStrip(request, before, growth, undefined) };
    }

    /** The strip a pool or a plane's lanes gained past their bounds before, asked of the plane, the pool no longer giving way. */
    private planeStrip(
        request: FrameRequest,
        before: DiagramBounds,
        growth: number,
        pool: LayoutShape | undefined,
    ): FrameRequest {
        return {
            plane: request.plane,
            container: undefined,
            lane: undefined,
            box: stripPast(this.axis, before, growth),
            line: this.far(before),
            exclude: new Set([...request.exclude, ...(pool ? [pool.id] : [])]),
            frameGrowth: growth,
        };
    }

    /** The lanes on the lane's plane outside a pool, the lane among them. */
    private lanesBeside(lane: LaneShape): LaneShape[] {
        return [...this.trial.shapes.values()].filter(
            (shape): shape is LaneShape =>
                shape.kind === "lane" && shape.plane === lane.plane && shape.pool === undefined,
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
        units: readonly SpaceUnit[],
        request: FrameRequest,
    ): { readonly units: SpaceUnit[]; readonly by: number } | undefined {
        const { box, floor, frameGrowth, column = [] } = request;
        const lands = (on: DiagramBounds, unit: SpaceUnit) =>
            !keepsClearOf(on, unit.bounds, SHAPE_CLEARANCE);
        const reachesBox = (unit: SpaceUnit) =>
            frameGrowth === undefined
                ? lands(box, unit)
                : liesAheadWithin(this.axis, box, unit.bounds, SHAPE_CLEARANCE);
        const columnUnder = (unit: SpaceUnit) =>
            column.filter((part) => !keepsClearOf(part, unit.bounds, 0));
        const partsLandedOn = (unit: SpaceUnit) => [
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
    private keptInLineAfter(unit: SpaceUnit, next: SpaceUnit, by: number): boolean {
        if (this.axis !== "x" || !this.topology.followersOf(unit.id).has(next.id)) return false;
        const inRow =
            unit.bounds.y < bottomOf(next.bounds) && next.bounds.y < bottomOf(unit.bounds);
        const gap = next.bounds.x - rightOf(unit.bounds);
        return inRow && gap >= 0 && gap - by < Math.min(ROOM_GAP, gap);
    }

    /**
     * How far the frame kept what lies in it from its far side before the
     * room was made, which it keeps when it grows: at least the frame
     * padding, at most the gap the room keeps.
     */
    private marginOf(frame: LayoutShape, units: readonly SpaceUnit[]): number {
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

    private get gap(): number {
        return this.axis === "x" ? ROOM_GAP : STACK_GAP;
    }

    private near(bounds: DiagramBounds): number {
        return nearSideOf(this.axis, bounds);
    }

    private far(bounds: DiagramBounds): number {
        return farSideOf(this.axis, bounds);
    }
}
