import type {
    DetectedEngine,
    EditableSurfaceMode,
    Engine,
    SurfaceMode,
} from "@miragon/bpmn-modeler-types/domain";

/**
 * Which injected factory builds a mode's surface: the one offered for that
 * mode (`own`), or the implement factory opened in `mode` (`modeler`).
 */
export type ServingFactory =
    | { readonly kind: "own"; readonly factory: "view" | "design" }
    | { readonly kind: "modeler"; readonly engine: Engine; readonly mode: EditableSurfaceMode };

/**
 * The factory that builds each mode's surface, `undefined` where none does.
 * `offered` names the modes the consumer supplies a factory for. The modeler
 * needs an engine; on a tagged model it serves Design too, so Design↔Implement
 * toggles live and keeps the engine's extension data.
 */
export function servingSurfaces(
    offered: readonly SurfaceMode[],
    engine: DetectedEngine,
): Record<SurfaceMode, ServingFactory | undefined> {
    const onModeler = (mode: EditableSurfaceMode): ServingFactory | undefined =>
        engine !== undefined && offered.includes("implement")
            ? { kind: "modeler", engine, mode }
            : undefined;
    const ownFactory = (factory: "view" | "design"): ServingFactory | undefined =>
        offered.includes(factory) ? { kind: "own", factory } : undefined;
    return {
        view: ownFactory("view"),
        design: onModeler("design") ?? ownFactory("design"),
        implement: onModeler("implement"),
    };
}
