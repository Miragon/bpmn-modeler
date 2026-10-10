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

/**
 * The chunks a saved mode predicts. Design predicts none: a tagged model's
 * Design is served by the modeler, and the engine is unknown until the host
 * replies.
 */
export function modulesToPrefetch(
    mode: SurfaceMode,
    options: { linting: boolean },
): PrefetchableModule[] {
    switch (mode) {
        case "view":
            return ["viewer"];
        case "implement":
            return options.linting ? ["modeler", "lint"] : ["modeler"];
        case "design":
            return [];
    }
}

/**
 * Starts loading the chunks of the expected surface while the host round-trip
 * is still pending. The factory's own `import()` joins the in-flight load; a
 * failure is left for that import to report.
 */
export function prefetchSurfaceModules(mode: SurfaceMode, options: { linting: boolean }): void {
    for (const module of modulesToPrefetch(mode, options)) {
        moduleLoaders[module]().catch(() => undefined);
    }
}
