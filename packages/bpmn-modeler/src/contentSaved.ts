import {
    asyncDebounce,
    type AsyncDebounced,
    type DisposableStore,
    type MinimalEventBus,
    subscribe,
} from "@miragon/bpmn-modeler-types";
import type { SurfaceReporter } from "./reporting";
import type { ContentSavedEvent } from "./publicApi";

export interface ContentSavedWiring {
    exportDiagram: () => Promise<string>;
    onContentSaved: (event: ContentSavedEvent) => void | Promise<void>;
    reporter: SurfaceReporter;
    isDisposed: () => boolean;
}

export function createContentSavedNotifier(
    wiring: ContentSavedWiring,
): AsyncDebounced<() => Promise<void>> {
    return asyncDebounce(
        async () => {
            try {
                await wiring.onContentSaved({ xml: await wiring.exportDiagram() });
            } catch (error) {
                // A destroy() racing an in-flight export/save produces noise
                // (e.g. NoModelerError) the embedder never asked for.
                if (wiring.isDisposed()) return;
                wiring.reporter.reportError(error);
            }
        },
        300,
        { maxWait: 1000 },
    );
}

/**
 * Subscribes the debounced content-saved notifier to `commandStack.changed` and
 * registers its teardown (unsubscribe + cancel the pending export) with the
 * surface's store, so a destroy mid-debounce settles cleanly. Disposal-race
 * suppression tracks the store, matching the surface's liveness.
 */
export function wireContentSaved(options: {
    store: DisposableStore;
    eventBus: MinimalEventBus;
    exportDiagram: () => Promise<string>;
    onContentSaved: (event: ContentSavedEvent) => void | Promise<void>;
    reporter: SurfaceReporter;
}): void {
    const notifier = createContentSavedNotifier({
        exportDiagram: options.exportDiagram,
        onContentSaved: options.onContentSaved,
        reporter: options.reporter,
        isDisposed: () => options.store.isDisposed,
    });
    const unsubscribe = subscribe(options.eventBus, "commandStack.changed", () => void notifier());
    options.store.add(() => {
        unsubscribe();
        notifier.cancel();
    });
}
