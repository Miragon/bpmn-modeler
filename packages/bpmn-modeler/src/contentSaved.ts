import { asyncDebounce, type AsyncDebounced } from "@miragon/bpmn-modeler-types";
import type { ContentSavedEvent } from "./publicApi";

export interface ContentSavedWiring {
    exportDiagram: () => Promise<string>;
    onContentSaved: (event: ContentSavedEvent) => void | Promise<void>;
    onError?: (error: unknown) => void;
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
                if (wiring.onError) wiring.onError(error);
                else console.error(error);
            }
        },
        300,
        { maxWait: 1000 },
    );
}
