/**
 * Pure geometry vocabulary shared by the engine port, the plan computation and
 * the applier. Structural types throughout, so unit tests pass plain object
 * literals without pulling in the bpmn-js runtime.
 */
import type { LayoutDiagnostic } from "@miragon/bpmn-modeler-types";

export interface Point {
    x: number;
    y: number;
}

export interface Bounds extends Point {
    width: number;
    height: number;
}

export interface ShapeGeometry extends Bounds {
    id: string;
}

export interface EdgeGeometry {
    id: string;
    waypoints: Point[];
}

/**
 * What a {@link LayoutEngine} returns: absolute geometry, never XML.
 *
 * Geometry rather than the engine's own XML, so nothing the engine drops or
 * rewrites can reach the model: an element it omits simply has no entry here,
 * and keeps the geometry it already had.
 */
export interface LayoutResult {
    shapes: ShapeGeometry[];
    edges: EdgeGeometry[];
    diagnostics: LayoutDiagnostic[];
}

/**
 * One element as it stands *before* any command runs. The applier takes this
 * snapshot once; every delta in the plan is derived from it, which is what
 * keeps the deltas valid for the whole batch regardless of execution order.
 */
export interface ElementSnapshot {
    id: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    parentId?: string;
    /** Set for connections. */
    waypoints?: Point[];
    /** Set for external label shapes; the id of the element they annotate. */
    labelTargetId?: string;
}

export type DiagramSnapshot = ElementSnapshot[];

/**
 * A single change to apply through the bpmn-js `modeling` API.
 *
 * The plan is emitted in execution order — shapes, then connections with
 * associations last, then labels — so the applier can walk it front to back.
 */
export type LayoutOperation =
    | { kind: "move"; id: string; delta: Point }
    | { kind: "resize"; id: string; bounds: Bounds }
    | { kind: "waypoints"; id: string; waypoints: Point[] }
    | { kind: "move-label"; id: string; delta: Point };
