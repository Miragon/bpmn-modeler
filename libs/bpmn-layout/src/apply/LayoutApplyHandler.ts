import type { Bounds, LayoutOperation, Point } from "../types";

/** The slice of bpmn-js `modeling` the applier uses. */
export interface ModelingLike {
    moveShape(
        shape: unknown,
        delta: Point,
        newParent?: unknown,
        hints?: Record<string, unknown>,
    ): void;
    resizeShape(
        shape: unknown,
        newBounds: Bounds,
        minBounds?: unknown,
        hints?: Record<string, unknown>,
    ): void;
    updateWaypoints(
        connection: unknown,
        newWaypoints: Point[],
        hints?: Record<string, unknown>,
    ): void;
}

export interface ElementRegistryLike {
    get(id: string): unknown;
}

/**
 * `recurse: false` — `MoveShapeHandler.postExecute` would otherwise call
 * `moveChildren`, and since every delta is derived from the pre-batch snapshot
 * a child moved by its parent *and* by its own operation lands twice.
 *
 * `layout: false` — it would otherwise call `modeling.layoutConnection()` on
 * every incoming and outgoing connection, rerouting and cropping exactly the
 * waypoints we are about to set.
 */
export const MOVE_HINTS = { layout: false, recurse: false };

/**
 * `attachSupport: false` — `AttachSupport` hooks `postExecute('shape.resize')`
 * and shifts every attacher and its labels by `getNewAttachShapeDelta`. Our
 * boundary events already carry their own operations.
 */
export const RESIZE_HINTS = { layout: false, attachSupport: false };

/**
 * `createElementsBehavior: false` — `AdaptiveLabelPositioningBehavior` hooks
 * `postExecuted('connection.updateWaypoints')` and repositions the labels of
 * the connection's source and target.
 *
 * `connection.updateWaypoints` rather than `connection.layout` is deliberate:
 * `BpmnUpdater` registers `cropConnection` for `layout` and `create` only, so
 * the points set here reach the DI uncropped.
 */
export const WAYPOINT_HINTS = { createElementsBehavior: false };

/**
 * Applies a layout plan as a single undo step.
 *
 * The handler has **only** `preExecute` on purpose. diagram-js's
 * `CommandStack._pushAction` assigns
 * `action.id = (baseAction && baseAction.id) || this._createId()`, and `undo()`
 * keeps unwinding while the ids match — so the `modeling.*` calls made here,
 * nested inside this command's own action, all collapse into one entry. It
 * also means one `commandStack.changed` for the whole batch, because
 * `_popAction` only fires on the outermost pop.
 *
 * `preExecute` runs outside `_atomicDo`, where nested `execute` is legal;
 * doing the same from `execute` would throw.
 */
export class LayoutApplyHandler {
    static $inject = ["modeling", "elementRegistry"];

    constructor(
        private readonly modeling: ModelingLike,
        private readonly elementRegistry: ElementRegistryLike,
    ) {}

    preExecute(context: { operations: LayoutOperation[] }): void {
        for (const operation of context.operations) {
            const element = this.elementRegistry.get(operation.id);
            if (!element) continue;

            switch (operation.kind) {
                case "move":
                    this.modeling.moveShape(element, operation.delta, undefined, MOVE_HINTS);
                    break;
                case "resize":
                    this.modeling.resizeShape(element, operation.bounds, undefined, RESIZE_HINTS);
                    break;
                case "waypoints":
                    this.modeling.updateWaypoints(element, operation.waypoints, WAYPOINT_HINTS);
                    break;
                case "move-label":
                    // A label has no children, no attachers and no connections,
                    // so none of the hints above have anything to suppress.
                    this.modeling.moveShape(element, operation.delta);
                    break;
            }
        }
    }
}
