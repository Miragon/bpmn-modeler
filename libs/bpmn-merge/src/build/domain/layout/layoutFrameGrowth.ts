import { type Axis, endsLevelAlong, farSideOf, liesAheadWithin, stripPast } from "./layoutAxis";
import type { DrawingDraft } from "./layoutDrawingDraft";
import { type DiagramBounds, bottomOf, boundsAround, liesWithin } from "./layoutGeometry";
import { type FrameScope, frameScopeOf, lanesOf, lanesWithoutPoolOn } from "./layoutFrames";
import {
    type LaneShape,
    type LayoutModel,
    type LayoutShape,
    type NodeShape,
    type PoolShape,
    reachOf,
} from "./layoutModel";
import { FRAME_PADDING, type SideGrowth, growthToHold, holdsLevel } from "./layoutPlacementFrames";
import { SHAPE_CLEARANCE } from "./layoutShapePlacement";
import type { FrameRequest, RoomRequest } from "./layoutRoomRequest";
import type { SpaceTool, SpaceUnit } from "./layoutSpaceTool";

/** The frame that grows when what lies in it no longer fits, by how it grows, and whether the pools level with its pool follow. */
export type GrowingFrame =
    | { readonly kind: "subProcess"; readonly subProcess: NodeShape }
    | {
          readonly kind: "laneDown";
          readonly lane: LaneShape;
          readonly pool: PoolShape | undefined;
          readonly keepsPoolsLevel: boolean;
      }
    | { readonly kind: "pool"; readonly pool: PoolShape; readonly keepsPoolsLevel: boolean }
    | { readonly kind: "planeLanes"; readonly lane: LaneShape }
    | { readonly kind: "plane" };

/**
 * Which frame room asked in the scope grows along the axis: the sub-process
 * it lies in; down a lane, the lane; else the pool, or the lanes of a plane
 * without a pool. The pools level with a pool grown down follow it.
 */
export function growingFrameOf({ container, lane }: FrameScope, axis: Axis): GrowingFrame {
    if (container?.kind === "node") return { kind: "subProcess", subProcess: container };
    const keepsPoolsLevel = axis === "y" && container !== undefined;
    if (axis === "y" && lane !== undefined) {
        return { kind: "laneDown", lane, pool: container, keepsPoolsLevel };
    }
    if (container !== undefined) return { kind: "pool", pool: container, keepsPoolsLevel };
    if (lane !== undefined) return { kind: "planeLanes", lane };
    return { kind: "plane" };
}

/** The strip a frame gained past its far side, as room asked of what lies around it. */
export type GainedStrip = Required<Pick<RoomRequest, "box" | "line" | "exclude" | "frameGrowth">>;

/** The strip bounds grown by `growth` along the axis gain; what is excluded neither gives way nor stands in the way. */
export function stripGained(
    axis: Axis,
    before: DiagramBounds,
    growth: number,
    exclude: Iterable<string>,
): GainedStrip {
    return {
        box: stripPast(axis, before, growth),
        line: farSideOf(axis, before),
        exclude: new Set(exclude),
        frameGrowth: growth,
    };
}

/** The plane outside every pool and lane. */
const PLANE_SCOPE: FrameScope = { container: undefined, lane: undefined };

/** What a push leaves in its frame: the units in it, those that might give way, and how far they and the box reach. */
export interface PushedFrame {
    readonly units: readonly SpaceUnit[];
    readonly givingWay: readonly SpaceUnit[];
    readonly extent: number;
}

/** The strip a frame gained, asked of the frame around it, and the pool whose growth the pools level with it follow once it is made. */
export interface OuterRoom {
    readonly request: FrameRequest & GainedStrip;
    readonly levelWith?: LevelGrowth;
}

interface LevelGrowth {
    readonly pool: PoolShape;
    readonly before: DiagramBounds;
    readonly growth: number;
}

/** The room a push was asked for in a frame, as far as the frame's growth passes it on. */
interface AskedRoom {
    readonly plane: string;
    readonly exclude: ReadonlySet<string>;
}

/**
 * Grows the frame a push no longer fits in, keeping the margin it had, and
 * answers the strip it gained as room asked of the frame around it, up to
 * the pools on the plane. Room below in a pool with lanes grows the lane, so
 * what lies under it shifts down.
 */
export class FrameGrowth {
    constructor(
        private readonly before: DrawingDraft,
        private readonly trial: DrawingDraft,
        private readonly space: SpaceTool,
        private readonly axis: Axis,
        /** How far what a room pushes keeps from what pushed it, which caps the margin a frame keeps. */
        private readonly roomGap: number,
    ) {}

    /** Grows the frame to hold what the push reached with the margin it kept; the strip it gained, none when it did not grow. */
    grow(frame: GrowingFrame, request: AskedRoom, pushed: PushedFrame): OuterRoom | undefined {
        switch (frame.kind) {
            case "subProcess":
                return this.growSubProcess(request, frame.subProcess, pushed);
            case "laneDown":
                return this.growLaneDown(request, frame, pushed);
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
    growLevelPools({ pool, before, growth }: LevelGrowth): void {
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
        request: AskedRoom,
        subProcess: NodeShape,
        { units, extent }: PushedFrame,
    ): OuterRoom | undefined {
        const frame = this.trial.shapes.get(subProcess.id)!;
        const growth = this.space.growFrame(frame, [], extent + this.marginOf(subProcess, units));
        if (growth <= 0) return undefined;
        const scope = frameScopeOf(this.trial, this.trial.node(frame.id)!);
        return { request: this.outerStrip(request, scope, frame.bounds, growth, frame.id) };
    }

    /**
     * Grows the lane down: what lies under it shifts down, the lanes across
     * its bottom grow with it and so does the pool, whose strip the plane is
     * asked for and the pools level with it follow.
     */
    private growLaneDown(
        request: AskedRoom,
        { lane, pool: container, keepsPoolsLevel }: Extract<GrowingFrame, { kind: "laneDown" }>,
        { units, givingWay, extent }: PushedFrame,
    ): OuterRoom | undefined {
        const pool = container && this.trial.pool(container.id)!;
        const lanes = pool ? lanesOf(this.trial, pool) : lanesWithoutPoolOn(this.trial, lane.plane);
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
            request: this.outerStrip(request, PLANE_SCOPE, before, growth, pool?.id),
            levelWith: keepsPoolsLevel && pool ? { pool, before, growth } : undefined,
        };
    }

    /** Grows the pool with its lanes across its far side, and asks the plane for the strip it gains. */
    private growPool(
        request: AskedRoom,
        container: PoolShape,
        keepsPoolsLevel: boolean,
        { units, extent }: PushedFrame,
    ): OuterRoom | undefined {
        const pool = this.trial.pool(container.id)!;
        const lanes = lanesOf(this.trial, pool);
        const before = boundsAround([pool, ...lanes].map(({ bounds }) => bounds));
        const growth = this.space.growFrame(pool, lanes, extent + this.marginOf(pool, units));
        if (growth <= 0) return undefined;
        return {
            request: this.outerStrip(request, PLANE_SCOPE, before, growth, pool.id),
            levelWith: keepsPoolsLevel ? { pool, before, growth } : undefined,
        };
    }

    /** Grows the lanes of a plane without a pool across their far side, and asks the plane for the strip they gain. */
    private growPlaneLanes(
        request: AskedRoom,
        lane: LaneShape,
        { units, extent }: PushedFrame,
    ): OuterRoom | undefined {
        const lanes = lanesWithoutPoolOn(this.trial, lane.plane);
        const before = boundsAround(lanes.map(({ bounds }) => bounds));
        const growth = this.space.growFrame(lane, lanes, extent + this.marginOf(lane, units));
        if (growth <= 0) return undefined;
        return { request: this.outerStrip(request, PLANE_SCOPE, before, growth) };
    }

    /**
     * The strip a frame gained past its bounds before, asked in the scope
     * around it. What already gave way to the push neither gives way again
     * nor stands in the way: without a pool the plane's shapes are units of
     * both the lanes and the plane.
     */
    private outerStrip(
        request: AskedRoom,
        scope: FrameScope,
        before: DiagramBounds,
        growth: number,
        grown?: string,
    ): OuterRoom["request"] {
        const excluded = [
            ...request.exclude,
            ...this.space.shifted,
            ...(grown === undefined ? [] : [grown]),
        ];
        return {
            plane: request.plane,
            ...scope,
            ...stripGained(this.axis, before, growth, excluded),
        };
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
            return [this.far(reachOf(shape))];
        });
        if (ends.length === 0) return FRAME_PADDING;
        const kept = this.far(bounds) - Math.max(...ends);
        return Math.min(this.roomGap, Math.max(FRAME_PADDING, kept));
    }

    private far(bounds: DiagramBounds): number {
        return farSideOf(this.axis, bounds);
    }
}

/** How a frame of a kind grows to hold a shape placed past its border. */
interface FrameKindGrowth {
    readonly kind: LayoutShape["kind"];
    /** Whether it grows up and down as well as sideways. */
    readonly growsUpAndDown: boolean;
    /** Whether its lanes grow with it and must hold the shape too. */
    readonly growsWithItsLanes: boolean;
    /** Whether what it lands on beyond its right side gives way, as making room does. */
    readonly shiftsWhatLiesBeyond: boolean;
}

/**
 * The frame kinds that grow on their own, the first to grow first. A
 * sub-process drawn open grows to every side and shifts what it lands on;
 * a pool grows with its lanes only sideways, as they are stacked across it,
 * and shifts nothing, as the pool beside it stays. A lane, stacked with the
 * others, never grows on its own.
 */
const FRAME_KINDS_IN_GROWTH_ORDER: readonly FrameKindGrowth[] = [
    { kind: "node", growsUpAndDown: true, growsWithItsLanes: false, shiftsWhatLiesBeyond: true },
    { kind: "pool", growsUpAndDown: false, growsWithItsLanes: true, shiftsWhatLiesBeyond: false },
];

/** The frame that grows to hold a shape placed past the borders of the frames it lies outside, as its kind lets it. */
export class FrameToGrow {
    private constructor(
        readonly frame: LayoutShape,
        private readonly kind: FrameKindGrowth,
        /** The lanes the shape lies outside, which never grow on their own. */
        private readonly lanes: readonly LayoutShape[],
    ) {}

    /** The frame that grows among those the shape lies outside; undefined when none of them grows on its own. */
    static among(frames: readonly LayoutShape[]): FrameToGrow | undefined {
        const lanes = frames.filter(({ kind }) => kind === "lane");
        for (const kind of FRAME_KINDS_IN_GROWTH_ORDER) {
            const frame = frames.find((candidate) => candidate.kind === kind.kind);
            if (frame !== undefined) return new FrameToGrow(frame, kind, lanes);
        }
        return undefined;
    }

    /** Whether the lanes the shape lies outside hold it from top to bottom, so that growing sideways is enough. */
    lanesHoldLevel(bounds: DiagramBounds): boolean {
        return this.lanes.every((lane) => holdsLevel(lane, bounds));
    }

    /** How far the frame must grow on each side to hold the bounds, and so must the lanes the shape lies outside where they grow with it. */
    growthToHold(bounds: DiagramBounds): SideGrowth {
        const holding = this.kind.growsWithItsLanes ? [this.frame, ...this.lanes] : [this.frame];
        return growthToHold(holding, bounds);
    }

    mayGrow({ top, bottom }: SideGrowth): boolean {
        return this.kind.growsUpAndDown || !(top > 0 || bottom > 0);
    }

    /** Whether what the frame grown so lands on beyond its right side gives way. */
    shiftsWhatLiesBeyond({ right }: SideGrowth): boolean {
        return this.kind.shiftsWhatLiesBeyond && right !== 0;
    }

    /** The lanes that grow sideways with the frame. */
    lanesGrowingWith(drawing: LayoutModel): LaneShape[] {
        return this.kind.growsWithItsLanes ? lanesOf(drawing, this.frame) : [];
    }
}
