import {
    cleanupSurfaceDiagram,
    formatSurfaceDiagram,
    hasSurfaceLayout,
    type LayoutOutcome,
    subscribeFormatted,
    type SurfaceInjector,
} from "@miragon/bpmn-modeler-layout";
import type { CleanupOutcome, Disposer } from "@miragon/bpmn-modeler-types";

import type { EditingSurface } from "../../kernel/port/bpmnSurface";

/** @experimental What a host calls on a surface's layout feature. */
export interface LayoutAccessor {
    formatDiagram(): Promise<LayoutOutcome>;
    cleanupDiagram(options?: { apply?: boolean }): CleanupOutcome;
    onFormatted(listener: (outcome: LayoutOutcome) => void): Disposer;
}

/** @experimental `undefined` on a surface built without the layout feature. */
export function layoutOf(surface: Pick<EditingSurface, "getService">): LayoutAccessor | undefined {
    const injector = surface.getService<SurfaceInjector>("injector");
    if (!hasSurfaceLayout(injector)) {
        return undefined;
    }
    return {
        formatDiagram: () => formatSurfaceDiagram(injector),
        cleanupDiagram: (options) => cleanupSurfaceDiagram(injector, options),
        onFormatted: (listener) => subscribeFormatted(injector, listener),
    };
}
