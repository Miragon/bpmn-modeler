/**
 * Function type for accessing a service from the bpmn-js DI container.
 *
 * @template T The service type to retrieve.
 * @param name The DI service name.
 */
type ServiceAccessor = <T>(name: string) => T;

/**
 * Reads, writes, and subscribes to element selection changes.
 *
 * Decoupled from the modeler through a {@link ServiceAccessor} so the
 * selection concern can be tested and composed independently.
 */
export class SelectionManager {
    constructor(private readonly getService: ServiceAccessor) {}

    /**
     * Returns the IDs of the currently selected elements.
     */
    getSelectedElementIds(): string[] {
        return this.getService<any>("selection")
            .get()
            .map((el: any) => el.id);
    }

    /**
     * Selects elements by their IDs.
     *
     * Silently skips IDs that no longer exist in the diagram (e.g. element
     * was deleted before the tab switch).
     *
     * @param ids Element IDs to select.
     */
    selectElementsByIds(ids: string[]): void {
        const registry = this.getService<any>("elementRegistry");
        const elements = ids
            .map((id: string) => registry.get(id))
            .filter(Boolean);
        if (elements.length > 0) {
            this.getService<any>("selection").select(elements);
        }
    }

    /**
     * Subscribes to selection changes on the event bus.
     *
     * @param cb Callback invoked with the IDs of the newly selected elements.
     */
    onSelectionChanged(cb: (elementIds: string[]) => void): void {
        this.getService<any>("eventBus").on(
            "selection.changed",
            (event: any) => {
                const ids = (event.newSelection ?? []).map(
                    (el: any) => el.id,
                );
                cb(ids);
            },
        );
    }
}
