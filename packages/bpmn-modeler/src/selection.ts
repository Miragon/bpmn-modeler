import type { Event } from "diagram-js/lib/core/EventBus";

import type { CoreServiceAccessor } from "./coreServices";

/**
 * Reads, writes, and subscribes to element selection changes.
 *
 * Decoupled from the modeler through a {@link CoreServiceAccessor} so the
 * selection concern can be tested and composed independently.
 */
export class SelectionManager {
    constructor(private readonly getService: CoreServiceAccessor) {}

    getSelectedElementIds(): string[] {
        return this.getService("selection")
            .get()
            .map((el) => el.id);
    }

    /**
     * Silently skips IDs that no longer exist in the diagram (e.g. element was
     * deleted before the tab switch). An empty or all-missing `ids` clears the
     * selection, so a snapshot captured with nothing selected restores faithfully.
     */
    selectElementsByIds(ids: string[]): void {
        const registry = this.getService("elementRegistry");
        const elements = ids.map((id) => registry.get(id)).filter(Boolean);
        this.getService("selection").select(elements);
    }

    /**
     * @returns a disposer that detaches the listener — call it when tearing the
     *   surface down so repeated subscribe cycles don't accumulate listeners.
     */
    onSelectionChanged(cb: (elementIds: string[]) => void): () => void {
        const eventBus = this.getService("eventBus");
        const handler = (event: Event & { newSelection?: { id: string }[] }): void => {
            const ids = (event.newSelection ?? []).map((el) => el.id);
            cb(ids);
        };
        eventBus.on("selection.changed", handler);
        return () => eventBus.off("selection.changed", handler);
    }
}
