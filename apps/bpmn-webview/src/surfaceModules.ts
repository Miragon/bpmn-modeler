import type { SurfaceMode } from "@miragon/bpmn-modeler-types";

export const loadViewerModule = () => import("@miragon/bpmn-modeler/viewer");
export const loadDesignerModule = () => import("@miragon/bpmn-modeler/design");
export const loadModelerModule = () => import("@miragon/bpmn-modeler");
export const loadLintModule = () => import("@miragon/bpmn-modeler/lint");

type PrefetchableModule = "viewer" | "modeler" | "lint";

const moduleLoaders: Record<PrefetchableModule, () => Promise<unknown>> = {
    viewer: loadViewerModule,
    modeler: loadModelerModule,
    lint: loadLintModule,
};

interface PrefetchOptions {
    linting: boolean;
}

/**
 * Design predicts none: a tagged model's Design is served by the modeler, and
 * the engine is unknown until the host replies.
 */
const PREDICTED_MODULES: Record<SurfaceMode, (options: PrefetchOptions) => PrefetchableModule[]> = {
    view: () => ["viewer"],
    design: () => [],
    implement: ({ linting }) => (linting ? ["modeler", "lint"] : ["modeler"]),
};

/** The chunks a saved mode predicts. */
export function modulesToPrefetch(
    mode: SurfaceMode,
    options: PrefetchOptions,
): PrefetchableModule[] {
    return PREDICTED_MODULES[mode](options);
}

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
