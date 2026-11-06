import type { DetectedEngine, SurfaceMode } from "@miragon/bpmn-modeler-types";
import type { ModelerMode } from "../publicApi";
import type { SurfaceContext, SurfaceFactories, SurfaceHandle } from "./publicApi";

export type SurfaceBuilder = (context: SurfaceContext) => Promise<SurfaceHandle>;

/**
 * The injected factory call that builds each mode's surface, `undefined` where
 * none does. The modeler needs an engine; on a tagged model it serves Design
 * too, so Design↔Implement toggles live and keeps the engine's extension data.
 */
export function servingSurfaces(
    surfaces: SurfaceFactories,
    engine: DetectedEngine,
): Record<SurfaceMode, SurfaceBuilder | undefined> {
    const { view, design, implement } = surfaces;
    const onModeler = (mode: ModelerMode): SurfaceBuilder | undefined =>
        engine !== undefined && implement !== undefined
            ? (context) => implement({ ...context, engine, mode })
            : undefined;
    return {
        view,
        design: onModeler("design") ?? design,
        implement: onModeler("implement"),
    };
}
