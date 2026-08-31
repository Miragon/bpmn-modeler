/**
 * @internal Host-adapter surface — drill-down root tracking used for canvas
 * view-state restore. Not part of the public API.
 */

/** Accessor for a service from the bpmn-js DI container, by name. */
type ServiceAccessor = <T>(name: string) => T;

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
 * process or a collapsed sub-process drill-down. Decoupled from the
 * modeler through a {@link ServiceAccessor} so the concern can be tested
 * and composed independently.
 */
export class RootElementManager {
    constructor(private readonly getService: ServiceAccessor) {}

    /**
     * Returns the ID of the active canvas root, or `undefined` when the
     * canvas is on the implicit (top-level process) root — which should
     * not be persisted because its ID is regenerated on every import.
     */
    getRootElementId(): string | undefined {
        const root = this.getService<any>("canvas").getRootElement();
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
        const canvas = this.getService<any>("canvas");
        const current = canvas.getRootElement();
        if (current?.id === id) {
            return false;
        }
        const element = this.getService<any>("elementRegistry").get(id);
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
     */
    onRootChanged(cb: (rootElementId: string | undefined) => void): void {
        this.getService<any>("eventBus").on("root.set", (event: any) => {
            const id = event.element?.id;
            cb(id && !id.startsWith(IMPLICIT_ROOT_PREFIX) ? id : undefined);
        });
    }
}
