/** Accessor for a service from the bpmn-js DI container, by name. */
type ServiceAccessor = <T>(name: string) => T;

/**
 * Reads, writes, and subscribes to element selection changes.
 *
 * Decoupled from the modeler through a {@link ServiceAccessor} so the
 * selection concern can be tested and composed independently.
 */
export class SelectionManager {
    constructor(private readonly getService: ServiceAccessor) {}

    getSelectedElementIds(): string[] {
        return this.getService<any>("selection")
            .get()
            .map((el: any) => el.id);
    }

    /**
     * Silently skips IDs that no longer exist in the diagram (e.g. element was
     * deleted before the tab switch). An empty or all-missing `ids` clears the
     * selection, so a snapshot captured with nothing selected restores faithfully.
     */
    selectElementsByIds(ids: string[]): void {
        const registry = this.getService<any>("elementRegistry");
        const elements = ids.map((id: string) => registry.get(id)).filter(Boolean);
        this.getService<any>("selection").select(elements);
    }

    /**
     * @returns a disposer that detaches the listener — call it when tearing the
     *   surface down so repeated subscribe cycles don't accumulate listeners.
     */
    onSelectionChanged(cb: (elementIds: string[]) => void): () => void {
        const eventBus = this.getService<any>("eventBus");
        const handler = (event: any): void => {
            const ids = (event.newSelection ?? []).map((el: any) => el.id);
            cb(ids);
        };
        eventBus.on("selection.changed", handler);
        return () => eventBus.off("selection.changed", handler);
    }
}
