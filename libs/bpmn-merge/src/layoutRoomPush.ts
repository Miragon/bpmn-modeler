import { type Axis, boundsShifted, farSideOf, liesAheadWithin, nearSideOf } from "./layoutAxis";
import type { DrawingDraft } from "./layoutDrawingDraft";
import type { FlowTopology } from "./layoutFlowTopology";
import { type DiagramBounds, bottomOf, keepsClearOf, rightOf } from "./layoutGeometry";
import { type GrowingFrame, FrameGrowth, growingFrameOf } from "./layoutFrameGrowth";
import { frameScopeOf } from "./layoutFrames";
import { GroupContent } from "./layoutGroupContent";
import type { NodeShape } from "./layoutModel";
import type { FrameRequest, RoomRequest } from "./layoutRoomRequest";
import type { ShapeGroups } from "./layoutShapeGroups";
import { SHAPE_CLEARANCE } from "./layoutShapePlacement";
import { SpaceTool, type SpaceUnit } from "./layoutSpaceTool";

/** How far what a room pushes keeps from what pushed it: in line along x, stacked along y. */
export const ROOM_GAP = 50;
export const STACK_GAP = 40;

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
    private readonly growth: FrameGrowth;

    constructor(
        private readonly before: DrawingDraft,
        private readonly trial: DrawingDraft,
        groups: ShapeGroups,
        private readonly topology: FlowTopology,
        private readonly axis: Axis,
    ) {
        this.space = new SpaceTool(before, trial, groups, axis);
        this.growth = new FrameGrowth(before, trial, this.space, axis, this.gap);
    }

    /**
     * Makes room for the request in the frame `at` lies in; false when
     * something before the line is in the way. Each group then follows the
     * shapes it enclosed before, but those the room places.
     */
    push(at: NodeShape, request: RoomRequest): boolean {
        const content = GroupContent.of(this.before, this.trial, at.plane, request.exclude);
        const made = this.roomIn({ ...request, plane: at.plane, ...frameScopeOf(this.trial, at) });
        if (made) content.follow(this.trial, this.axis);
        return made;
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
        const outer = this.growth.grow(frame, request, { units, givingWay, extent });
        if (outer === undefined) return true;
        const made = this.roomIn(outer.request);
        if (made && outer.levelWith !== undefined) this.growth.growLevelPools(outer.levelWith);
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
