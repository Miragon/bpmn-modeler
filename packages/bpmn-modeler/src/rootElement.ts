// Drill-down root tracking used for canvas view-state restore. Exposed on the
// modeler/designer handles (`handle.rootElement`), so it must not be tagged
// `@internal` — the d.ts roll-up would strip the getter from the published
// class while the handle interface still requires it.

import type { Event } from "diagram-js/lib/core/EventBus";

import type { CoreServiceAccessor } from "./coreServices";

/**
 * bpmn-js assigns synthetic root IDs prefixed with this token when no
 * user-created root exists yet. These are internal and must not be
 * persisted — restoring one after the modeler re-imports would fail
 * because the ID is regenerated on every import.
 */
const IMPLICIT_ROOT_PREFIX = "__implicitroot";

/**
 * Reads, writes, and subscribes to the active canvas root element.
 *
 * The root element determines which plane is visible — the top-level
 * process or a collapsed sub-process drill-down.
 *
 * An interface rather than the implementing class for the same reason as
 * `ViewportManager`: each subpath's d.ts roll-up duplicates the declaration,
 * and only a structural type keeps the copies mutually assignable.
 */
export interface RootElementManager {
    /**
     * Returns the ID of the active canvas root, or `undefined` when the
     * canvas is on the implicit (top-level process) root — which should
     * not be persisted because its ID is regenerated on every import.
     */
    getRootElementId(): string | undefined;

    /**
     * Switches the canvas to the root element with the given ID.
     *
     * @returns `false` when the element does not exist or is already the
     *   current root, so the caller knows no plane switch occurred.
     */
    setRootElementById(id: string | undefined): boolean;

    /**
     * Subscribes to root element changes on the event bus.
     *
     * @param cb Callback invoked with the new root element's ID (or
     *   `undefined` for the implicit root) whenever the active plane changes.
     * @returns a disposer that detaches the listener — call it when tearing the
     *   surface down so repeated subscribe cycles don't accumulate listeners.
     */
    onRootChanged(cb: (rootElementId: string | undefined) => void): () => void;
}

/**
 * Decoupled from the modeler through a {@link CoreServiceAccessor} so the
 * concern can be tested and composed independently.
 */
export class CanvasRootElementManager implements RootElementManager {
    constructor(private readonly getService: CoreServiceAccessor) {}

    /**
     * Returns the ID of the active canvas root, or `undefined` when the
     * canvas is on the implicit (top-level process) root — which should
     * not be persisted because its ID is regenerated on every import.
     */
    getRootElementId(): string | undefined {
        const root = this.getService("canvas").getRootElement();
        if (!root || root.id.startsWith(IMPLICIT_ROOT_PREFIX)) {
            return undefined;
        }
        return root.id;
    }

    /**
     * Switches the canvas to the root element with the given ID.
     *
     * @returns `false` when the element does not exist (e.g. the
     *   sub-process was removed by an undo) or is already the current
     *   root, so the caller knows no plane switch occurred. Must be
     *   called *before* applying a viewbox — viewbox coordinates are
     *   plane-relative, and the DrilldownCentering handler scrolls on
     *   `root.set`, which a subsequent `setViewport` overrides.
     */
    setRootElementById(id: string | undefined): boolean {
        if (!id) {
            return false;
        }
        const canvas = this.getService("canvas");
        const current = canvas.getRootElement();
        if (current?.id === id) {
            return false;
        }
        const element = this.getService("elementRegistry").get(id);
        if (!element) {
            return false;
        }
        canvas.setRootElement(element);
        return true;
    }

    /**
     * Subscribes to root element changes on the event bus.
     *
     * @param cb Callback invoked with the new root element's ID (or
     *   `undefined` for the implicit root) whenever the active plane
     *   changes — e.g. drill-down into a collapsed sub-process.
     * @returns a disposer that detaches the listener — call it when tearing the
     *   surface down so repeated subscribe cycles don't accumulate listeners.
     */
    onRootChanged(cb: (rootElementId: string | undefined) => void): () => void {
        const eventBus = this.getService("eventBus");
        const handler = (event: Event & { element?: { id?: string } }): void => {
            const id = event.element?.id;
            cb(id && !id.startsWith(IMPLICIT_ROOT_PREFIX) ? id : undefined);
        };
        eventBus.on("root.set", handler);
        return () => eventBus.off("root.set", handler);
    }
}
