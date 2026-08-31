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
     * Silently skips IDs that no longer exist in the diagram (e.g. element
     * was deleted before the tab switch).
     */
    selectElementsByIds(ids: string[]): void {
        const registry = this.getService<any>("elementRegistry");
        const elements = ids.map((id: string) => registry.get(id)).filter(Boolean);
        if (elements.length > 0) {
            this.getService<any>("selection").select(elements);
        }
    }

    onSelectionChanged(cb: (elementIds: string[]) => void): void {
        this.getService<any>("eventBus").on("selection.changed", (event: any) => {
            const ids = (event.newSelection ?? []).map((el: any) => el.id);
            cb(ids);
        });
    }
}
