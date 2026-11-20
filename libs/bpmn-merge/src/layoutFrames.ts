import { liesWithin } from "./layoutGeometry";
import {
    FLOW_ENDS,
    type LaneShape,
    type LayoutEdge,
    type LayoutModel,
    type LayoutShape,
    type NodeShape,
    type PoolShape,
    endShapeOf,
    isFrame,
} from "./layoutModel";

/** The pool drawn around the node on its plane; none for a data store's pool, as it may lie outside. */
export function drawnPoolOf(layout: LayoutModel, node: NodeShape): PoolShape | undefined {
    if (node.pool === undefined || node.mayLieOutsidePool) return undefined;
    const pool = layout.shapes.get(node.pool);
    return pool?.kind === "pool" && isDrawnFrameOf(node, pool) ? pool : undefined;
}

/**
 * The pool the node goes with: its drawn pool, or for a node drawn with
 * none, such as a data store or an artifact of the collaboration, the pool
 * on its plane it lies within.
 */
export function holdingPoolOf(layout: LayoutModel, node: NodeShape): LayoutShape | undefined {
    const drawn = drawnPoolOf(layout, node);
    if (drawn !== undefined) return drawn;
    for (const shape of layout.shapes.values()) {
        if (
            shape.kind === "pool" &&
            shape.plane === node.plane &&
            liesWithin(node.bounds, shape.bounds)
        ) {
            return shape;
        }
    }
    return undefined;
}

/** The lanes of the pool's process drawn on its plane, wherever they lie, in document order. */
export function lanesOf(layout: LayoutModel, pool: LayoutShape): LaneShape[] {
    return [...layout.shapes.values()].filter(
        (shape): shape is LaneShape =>
            shape.kind === "lane" && shape.pool === pool.id && shape.plane === pool.plane,
    );
}

/** The lanes drawn without a pool on the plane, in document order. */
export function lanesWithoutPoolOn(layout: LayoutModel, plane: string): LaneShape[] {
    return [...layout.shapes.values()].filter(
        (shape): shape is LaneShape =>
            shape.kind === "lane" && shape.plane === plane && shape.pool === undefined,
    );
}

/** The other lanes with the lane's parent on its plane. */
export function siblingLanesOf(layout: LayoutModel, lane: LaneShape): LaneShape[] {
    return [...layout.shapes.values()].filter(
        (shape): shape is LaneShape =>
            shape.kind === "lane" &&
            shape.id !== lane.id &&
            shape.plane === lane.plane &&
            shape.parent === lane.parent,
    );
}

/** The lanes the lane is nested in, from the innermost. */
export function parentLanesOf(layout: LayoutModel, lane: LaneShape): string[] {
    const parents: string[] = [];
    for (let parent = layout.shapes.get(lane.parent); parent?.kind === "lane";) {
        if (parents.includes(parent.id)) break;
        parents.push(parent.id);
        parent = layout.shapes.get(parent.parent);
    }
    return parents;
}

/** The lanes inside the lane at any depth, in document order. */
export function descendantLanesOf(layout: LayoutModel, lane: LaneShape): LaneShape[] {
    const lanes = [...layout.shapes.values()].filter(
        (shape): shape is LaneShape => shape.kind === "lane" && shape.plane === lane.plane,
    );
    return lanes.filter((candidate) => parentLanesOf(layout, candidate).includes(lane.id));
}

/** What a lane shifts with: its parent lane or the process whose lane set holds it, and its pool; nothing for a pool. */
export function carrierIdsOf(frame: LayoutShape): string[] {
    if (frame.kind !== "lane") return [];
    return [frame.parent, ...(frame.pool === undefined ? [] : [frame.pool])];
}

/**
 * The drawn frames on the node's plane that the node must lie inside: its
 * sub-process when it has one, which stands for its contents in the pool and
 * lanes, otherwise its pool and lanes.
 */
export function framesOf(layout: LayoutModel, node: NodeShape): LayoutShape[] {
    return frameIdsOf(node).flatMap((id) => {
        const frame = layout.shapes.get(id);
        return isDrawnFrameOf(node, frame) ? [frame] : [];
    });
}

/** The frames the node must lie inside by its relations, drawn or not, as `framesOf` picks them. */
export function frameIdsOf(node: NodeShape): string[] {
    const subProcess = node.subProcesses[0];
    if (subProcess !== undefined) return [subProcess];
    if (node.mayLieOutsidePool) return [];
    return [...(node.pool === undefined ? [] : [node.pool]), ...node.lanes];
}

/**
 * The innermost drawn frame both ends of the flow lie in: an expanded
 * sub-process, else their pool. None for a flow between pools or to one.
 */
export function sharedFrameOf(layout: LayoutModel, edge: LayoutEdge): LayoutShape | undefined {
    const [source, target] = FLOW_ENDS.map((end) => {
        const shape = endShapeOf(layout, edge, end);
        return shape?.kind === "node" ? enclosingFramesOf(layout, shape) : [];
    });
    return source!.find((frame) => target!.includes(frame));
}

/** Every drawn frame around the node: its sub-processes drawn open, innermost first, then its pool and lanes. */
export function framesAroundOf(layout: LayoutModel, node: NodeShape): LayoutShape[] {
    const lanes = node.mayLieOutsidePool ? [] : node.lanes;
    return [
        ...enclosingFramesOf(layout, node),
        ...lanes.flatMap((id) => {
            const lane = layout.shapes.get(id);
            return isDrawnFrameOf(node, lane) ? [lane] : [];
        }),
    ];
}

/** The innermost frames around a node: a sub-process drawn open, which holds no lane, else its pool and lane, either none on a plane outside a pool or outside lanes. */
export type FrameScope =
    | { readonly container: NodeShape; readonly lane: undefined }
    | { readonly container: PoolShape | undefined; readonly lane: LaneShape | undefined };

/** The innermost sub-process drawn open or pool around the node on its plane. */
export function innermostFrameOf(
    layout: LayoutModel,
    node: NodeShape,
): NodeShape | PoolShape | undefined {
    return enclosingFramesOf(layout, node)[0];
}

/** The node's innermost frame, and outside a sub-process its innermost drawn lane, the one no other of its lanes is nested in. */
export function frameScopeOf(layout: LayoutModel, node: NodeShape): FrameScope {
    const container = innermostFrameOf(layout, node);
    if (container?.kind === "node") return { container, lane: undefined };
    const lanes = framesAroundOf(layout, node).filter(
        (frame): frame is LaneShape => frame.kind === "lane",
    );
    return {
        container,
        lane: lanes.find((lane) => !lanes.some((other) => other.parent === lane.id)),
    };
}

/** The drawn frames around the node, innermost first. */
function enclosingFramesOf(layout: LayoutModel, node: NodeShape): (NodeShape | PoolShape)[] {
    const pool = drawnPoolOf(layout, node);
    const subProcesses = node.subProcesses.flatMap((id) => {
        const frame = layout.shapes.get(id);
        return frame?.kind === "node" && isDrawnFrameOf(node, frame) ? [frame] : [];
    });
    return pool === undefined ? subProcesses : [...subProcesses, pool];
}

function isDrawnFrameOf(node: NodeShape, frame: LayoutShape | undefined): frame is LayoutShape {
    return frame !== undefined && frame.plane === node.plane && isFrame(frame);
}
