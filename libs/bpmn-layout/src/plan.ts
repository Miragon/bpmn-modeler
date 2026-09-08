import type {
    Bounds,
    DiagramSnapshot,
    ElementSnapshot,
    LayoutOperation,
    LayoutResult,
    Point,
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

/**
 * The point half way along a polyline, measured by accumulated length.
 *
 * Used only to derive how far a connection's label should travel, so the
 * user's manual label offset survives a reroute instead of being snapped to a
 * computed position.
 */
export function polylineMidpoint(waypoints: Point[]): Point {
    if (waypoints.length === 0) return { x: 0, y: 0 };
    if (waypoints.length === 1) return { ...waypoints[0] };

    const segments = waypoints.slice(1).map((point, i) => {
        const previous = waypoints[i];
        return Math.hypot(point.x - previous.x, point.y - previous.y);
    });
    const total = segments.reduce((sum, length) => sum + length, 0);
    if (total === 0) return { ...waypoints[0] };

    let travelled = 0;
    for (let i = 0; i < segments.length; i++) {
        const length = segments[i];
        if (travelled + length >= total / 2) {
            const ratio = length === 0 ? 0 : (total / 2 - travelled) / length;
            const from = waypoints[i];
            const to = waypoints[i + 1];
            return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
        }
        travelled += length;
    }
    return { ...waypoints[waypoints.length - 1] };
}

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

    const shapeOperations: LayoutOperation[] = [];
    /** id → how far the shape moved, for the labels that follow it. */
    const shapeDeltas = new Map<string, Point>();

    for (const shape of target.shapes) {
        const current = byId.get(shape.id);
        if (!current || current.waypoints) continue;

        const moved = !samePoint(current, shape);
        const resized = !sameSize(current, shape);
        if (!moved && !resized) continue;

        shapeDeltas.set(shape.id, { x: shape.x - current.x, y: shape.y - current.y });

        if (resized) {
            // One resize carries position and size together; `ResizeShapeHandler`
            // assigns x/y/width/height in a single command.
            shapeOperations.push({ kind: "resize", id: shape.id, bounds: clampSize(shape) });
        } else {
            shapeOperations.push({
                kind: "move",
                id: shape.id,
                delta: { x: shape.x - current.x, y: shape.y - current.y },
            });
        }
    }

    const edgeOperations: LayoutOperation[] = [];
    const associationOperations: LayoutOperation[] = [];
    /** id → midpoint travel, for the labels that follow a connection. */
    const edgeDeltas = new Map<string, Point>();

    for (const edge of target.edges) {
        const current = byId.get(edge.id);
        if (!current?.waypoints) continue;
        if (sameWaypoints(current.waypoints, edge.waypoints)) continue;

        const before = polylineMidpoint(current.waypoints);
        const after = polylineMidpoint(edge.waypoints);
        edgeDeltas.set(edge.id, { x: after.x - before.x, y: after.y - before.y });

        const operation: LayoutOperation = {
            kind: "waypoints",
            id: edge.id,
            waypoints: edge.waypoints,
        };
        if (isAssociation(current.type)) associationOperations.push(operation);
        else edgeOperations.push(operation);
    }

    const labelOperations: LayoutOperation[] = [];
    for (const element of snapshot) {
        if (!element.labelTargetId) continue;
        const delta = shapeDeltas.get(element.labelTargetId) ?? edgeDeltas.get(element.labelTargetId);
        if (!delta || samePoint(delta, { x: 0, y: 0 })) continue;
        labelOperations.push({ kind: "move-label", id: element.id, delta });
    }

    return [...shapeOperations, ...edgeOperations, ...associationOperations, ...labelOperations];
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
