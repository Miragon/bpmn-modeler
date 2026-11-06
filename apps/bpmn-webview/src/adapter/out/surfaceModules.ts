import type { SurfaceMode } from "@miragon/bpmn-modeler-types";

import {
    modulesToPrefetch,
    type PrefetchableModule,
    type PrefetchOptions,
} from "../../domain/modulesToPrefetch";

export const loadViewerModule = () => import("@miragon/bpmn-modeler/viewer");
export const loadDesignerModule = () => import("@miragon/bpmn-modeler/design");
export const loadModelerModule = () => import("@miragon/bpmn-modeler");
export const loadLintModule = () => import("@miragon/bpmn-modeler/lint");

const moduleLoaders: Record<PrefetchableModule, () => Promise<unknown>> = {
    viewer: loadViewerModule,
    modeler: loadModelerModule,
    lint: loadLintModule,
};

/**
 * Starts loading the chunks of the expected surface while the host round-trip
 * is still pending. The factory's own `import()` joins the in-flight load; a
 * failure is left for that import to report.
 */
export function prefetchSurfaceModules(mode: SurfaceMode, options: PrefetchOptions): void {
    for (const module of modulesToPrefetch(mode, options)) {
        moduleLoaders[module]().catch(() => undefined);
    }
}
