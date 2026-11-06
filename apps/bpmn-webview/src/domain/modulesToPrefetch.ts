import type { SurfaceMode } from "@miragon/bpmn-modeler-types";

export type PrefetchableModule = "viewer" | "modeler" | "lint";

export interface PrefetchOptions {
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
