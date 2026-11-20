import {
    type Axis,
    along,
    endsLevelAlong,
    farBorderOf,
    farSideOf,
    grownAlong,
    nearSideOf,
    offsetAlong,
} from "./layoutAxis";
import type { DrawingDraft } from "./layoutDrawingDraft";
import { stretchedEdge } from "./layoutEdgeStretch";
import { type DiagramBounds, bordersAt, centerOf, translated } from "./layoutGeometry";
import {
    type LaneShape,
    type LayoutModel,
    type LayoutShape,
    type NodeShape,
    drawnHostOf,
    holdingPoolOf,
    innermostFrameOf,
    lanesOf,
    translatedNode,
} from "./layoutModel";
import { type ShapeGroups, groupBoundsIn } from "./layoutShapeGroups";

/** A node with everything that moves with it, or a pool with its lanes and contents: what gives way as one. */
export interface SpaceUnit {
    readonly id: string;
    readonly bounds: DiagramBounds;
    /** Where the unit lies along the axis, which decides the side of a line it is on. */
    readonly lead: number;
    readonly nodes: readonly string[];
    readonly frames: readonly string[];
}

/** A band of `by` opened at `line`: what lies at or past it shifts, the frames it opens in grow. */
export interface Band {
    readonly line: number;
    readonly by: number;
    readonly units: readonly SpaceUnit[];
    /** The frames that shift on their own once they lie at or past the line. */
    readonly frames: readonly LayoutShape[];
    /** The frames the band opens in, which grow by it instead. */
    readonly growing: ReadonlySet<string>;
}

/**
 * The modeler's space tool along one axis on a trial drawing: it shifts a
 * node with its boundary events, label and contents by where it lies along
 * the axis (a sub-process drawn open by its near side, another node by its
 * center), a pool with its lanes and contents by its near side, grows the
 * frames a band opens in and stretches the flows between what shifted
 * differently by their runs across the axis. It checks nothing: whether the
 * drawing still holds is the caller's question.
 */
export class SpaceTool {
    /** How far each shifted node and frame went along the axis. */
    private readonly shift = new Map<string, number>();
    private readonly shiftedUnits = new Set<string>();

    constructor(
        private readonly before: DrawingDraft,
        private readonly trial: DrawingDraft,
        private readonly groups: ShapeGroups,
        private readonly axis: Axis,
    ) {}

    /** The outermost shapes that gave way, pools among them, in document order. */
    get shifted(): string[] {
        return [...this.before.shapes.keys()].filter((id) => this.shiftedUnits.has(id));
    }

    static shiftedBy(
        _drawing: LayoutModel,
        _tools: readonly Pick<SpaceTool, "shifted">[],
    ): string[] {
        return [];
    }

    /** Every shape that moved, frames among them. */
    get moved(): string[] {
        return [...this.shift.keys()];
    }

    /** Opens the band: each unit and frame at or past the line that has not given way yet shifts, the growing frames grow. */
    openBand({ line, by, units, frames, growing }: Band): void {
        for (const unit of units) {
            if (unit.lead >= line && !this.shiftedUnits.has(unit.id)) this.shiftUnit(unit, by);
        }
        for (const frame of frames) {
            if (growing.has(frame.id)) this.trial.replaceShape(this.grown(frame, by));
            else if (nearSideOf(this.axis, frame.bounds) >= line) this.moveShape(frame, by);
        }
    }

    shiftUnit(unit: SpaceUnit, by: number): void {
        for (const id of unit.nodes) {
            const node = this.trial.node(id);
            if (node !== undefined) this.moveShape(node, by);
        }
        for (const id of unit.frames) this.moveShape(this.trial.shapes.get(id)!, by);
        this.shiftedUnits.add(unit.id);
    }

    /**
     * Grows the frame to reach the far side, with those of the lanes that
     * reach its far side and the boundary events on that side. Returns the
     * growth.
     */
    growFrame(frame: LayoutShape, lanes: readonly LaneShape[], farSide: number): number {
        const growth = farSide - farSideOf(this.axis, frame.bounds);
        if (growth <= 0) return 0;
        const side = farBorderOf(this.axis);
        const across = lanes.filter(
            (lane) => lane.id !== frame.id && endsLevelAlong(this.axis, lane.bounds, frame.bounds),
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
     * The units directly in the container: its nodes with what moves with
     * them, and on a plane outside a pool also its pools, each with the
     * nodes it holds (`holdingPoolOf`).
     */
    unitsIn(
        plane: string,
        container: LayoutShape | undefined,
        exclude: ReadonlySet<string>,
    ): SpaceUnit[] {
        const { trial } = this;
        const nodes = trial
            .nodesOn(plane)
            .filter(
                (node) =>
                    !exclude.has(node.id) &&
                    drawnHostOf(trial, node) === undefined &&
                    innermostFrameOf(trial, node)?.id === container?.id,
            )
            .map((node): SpaceUnit => {
                const group = this.groups.of(trial, node);
                return {
                    id: node.id,
                    bounds: groupBoundsIn(trial, group),
                    lead: leadAlong(this.axis, node),
                    nodes: group.members,
                    frames: [],
                };
            });
        if (container !== undefined) return nodes;
        const pools = [...trial.shapes.values()]
            .filter(
                (shape) => shape.kind === "pool" && shape.plane === plane && !exclude.has(shape.id),
            )
            .map((pool): SpaceUnit => ({
                id: pool.id,
                bounds: pool.bounds,
                lead: nearSideOf(this.axis, pool.bounds),
                nodes: trial
                    .nodesOn(plane)
                    .filter((node) => holdingPoolOf(trial, node)?.id === pool.id)
                    .map(({ id }) => id),
                frames: [pool.id, ...lanesOf(trial, pool).map(({ id }) => id)],
            }));
        const inPools = new Set(pools.flatMap((pool) => pool.nodes));
        return [...nodes.filter(({ id }) => !inPools.has(id)), ...pools];
    }

    /**
     * Moves each edge between shapes that shifted alike with them and
     * stretches each edge between shapes that shifted differently by runs
     * across the axis, so its segments keep their direction; a run between
     * the ends goes with the end that shifted further when it lies at or past
     * the `line` where that shift starts, by default the near side of that
     * end. The edges left out are re-routed by the flow repair.
     */
    stretchEdges(plane: string, leftOut: ReadonlySet<string>, line?: number): void {
        for (const edge of this.before.edgesOn(plane)) {
            if (leftOut.has(edge.id) || edge.waypoints.length === 0) continue;
            const bySource = edge.source === undefined ? 0 : (this.shift.get(edge.source) ?? 0);
            const byTarget = edge.target === undefined ? 0 : (this.shift.get(edge.target) ?? 0);
            if (bySource !== 0 || byTarget !== 0) {
                this.trial.replaceEdge(
                    stretchedEdge(this.before, edge, this.axis, bySource, byTarget, line),
                );
            }
        }
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

    private grown<Shape extends LayoutShape>(shape: Shape, by: number): Shape {
        return { ...shape, bounds: grownAlong(this.axis, shape.bounds, by) };
    }
}

/** Where a node lies along the axis: a sub-process drawn open by its near side, another node by its center. */
export function leadAlong(axis: Axis, node: NodeShape): number {
    return node.expanded ? nearSideOf(axis, node.bounds) : along(axis, centerOf(node.bounds));
}
