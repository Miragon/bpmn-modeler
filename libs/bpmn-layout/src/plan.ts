import { polylineMidpoint } from "@miragon/bpmn-modeler-types";

import type {
    Bounds,
    DiagramSnapshot,
    EdgeGeometry,
    ElementSnapshot,
    LayoutOperation,
    LayoutResult,
    Point,
    ShapeGeometry,
} from "./types";

/**
 * Geometry closer than this is treated as unchanged. Half a pixel is below
 * anything a user can see and well above the noise a float round trip through
 * XML introduces.
 */
const EPSILON = 0.5;

function samePoint(a: Point, b: Point): boolean {
    return Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON;
}

function sameSize(a: Bounds, b: Bounds): boolean {
    return Math.abs(a.width - b.width) < EPSILON && Math.abs(a.height - b.height) < EPSILON;
}

function sameWaypoints(a: Point[], b: Point[]): boolean {
    return a.length === b.length && a.every((point, i) => samePoint(point, b[i]));
}

function isAssociation(type: string): boolean {
    return type.includes("Association");
}

export { polylineMidpoint };

/**
 * Turns absolute target geometry into the ordered list of changes to apply.
 *
 * Two properties this function is responsible for, both load-bearing:
 *
 * - **Every delta is derived from `snapshot`**, never from intermediate state.
 *   Combined with the applier's `recurse: false` / `attachSupport: false`
 *   hints — which stop any single command from moving anything but its own
 *   shape — that makes each delta valid for the whole batch, so no
 *   parent-before-child ordering is needed.
 * - **Unchanged geometry yields no operation.** An empty plan means the
 *   applier executes nothing at all, which is both what makes formatting
 *   idempotent and what keeps a no-op format off the undo stack.
 *
 * Emission order is fixed: shapes, then connections with associations last
 * (`LayoutConnectionBehavior` re-adjusts connections docked onto other
 * connections and cannot be disabled by a hint, so ours must be the last
 * write), then labels, which depend on final waypoints.
 */
export function computeLayoutPlan(
    snapshot: DiagramSnapshot,
    target: LayoutResult,
): LayoutOperation[] {
    const byId = new Map<string, ElementSnapshot>(snapshot.map((element) => [element.id, element]));

    const shapes = planShapes(byId, target.shapes);
    const edges = planEdges(byId, target.edges);
    const labelFollow: LabelFollow = new Map([...shapes.labelFollow, ...edges.labelFollow]);

    return [...shapes.operations, ...edges.operations, ...planLabelMoves(snapshot, labelFollow)];
}

/** Element id → how far the external label of that element travels with it. */
type LabelFollow = Map<string, Point>;

interface PlannedPass {
    operations: LayoutOperation[];
    labelFollow: LabelFollow;
}

/**
 * A resized shape gets no label-follow entry: bpmn-js's `LabelBehavior` moves
 * its external label on `shape.resize` and takes no hint to stop that.
 */
function planShapes(byId: Map<string, ElementSnapshot>, shapes: ShapeGeometry[]): PlannedPass {
    const operations: LayoutOperation[] = [];
    const labelFollow: LabelFollow = new Map();

    for (const shape of shapes) {
        const current = byId.get(shape.id);
        if (!current || current.waypoints) continue;

        const moved = !samePoint(current, shape);
        const resized = !sameSize(current, shape);
        if (!moved && !resized) continue;

        if (resized) {
            // One resize carries position and size together; `ResizeShapeHandler`
            // assigns x/y/width/height in a single command.
            operations.push({ kind: "resize", id: shape.id, bounds: clampSize(shape) });
        } else {
            const delta = { x: shape.x - current.x, y: shape.y - current.y };
            labelFollow.set(shape.id, delta);
            operations.push({ kind: "move", id: shape.id, delta });
        }
    }

    return { operations, labelFollow };
}

/** A connection's label follows its midpoint. */
function planEdges(byId: Map<string, ElementSnapshot>, edges: EdgeGeometry[]): PlannedPass {
    const edgeOperations: LayoutOperation[] = [];
    const associationOperations: LayoutOperation[] = [];
    const labelFollow: LabelFollow = new Map();

    for (const edge of edges) {
        const current = byId.get(edge.id);
        if (!current?.waypoints) continue;
        if (sameWaypoints(current.waypoints, edge.waypoints)) continue;

        // The label moves as far as the flow's middle, so a manual label offset survives a reroute.
        const before = polylineMidpoint(current.waypoints);
        const after = polylineMidpoint(edge.waypoints);
        labelFollow.set(edge.id, { x: after.x - before.x, y: after.y - before.y });

        const operation: LayoutOperation = {
            kind: "waypoints",
            id: edge.id,
            waypoints: edge.waypoints,
        };
        if (isAssociation(current.type)) associationOperations.push(operation);
        else edgeOperations.push(operation);
    }

    return { operations: [...edgeOperations, ...associationOperations], labelFollow };
}

function planLabelMoves(snapshot: DiagramSnapshot, labelFollow: LabelFollow): LayoutOperation[] {
    const operations: LayoutOperation[] = [];
    for (const element of snapshot) {
        if (!element.labelTargetId) continue;
        const delta = labelFollow.get(element.labelTargetId);
        if (!delta || samePoint(delta, { x: 0, y: 0 })) continue;
        operations.push({ kind: "move-label", id: element.id, delta });
    }
    return operations;
}

/**
 * `ResizeShapeHandler` throws below 10px in either dimension, so a degenerate
 * engine result must not reach it.
 */
function clampSize(bounds: Bounds): Bounds {
    return {
        x: bounds.x,
        y: bounds.y,
        width: Math.max(10, bounds.width),
        height: Math.max(10, bounds.height),
    };
}
