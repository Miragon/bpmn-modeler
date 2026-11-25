export type SurfaceBaseKind = "modeler" | "viewer";

interface BaseShape {
    readonly prototype?: { readonly importXML?: unknown; readonly createDiagram?: unknown };
}

/** A bpmn-js constructor, told apart from a lazy loader (a function too) by `importXML`. */
export function isBaseConstructor(value: unknown): boolean {
    return (
        typeof value === "function" &&
        typeof (value as BaseShape).prototype?.importXML === "function"
    );
}

/** The constructor a lazy loader resolved to: the module's default export or the value itself. */
export function baseOfLoaded(loaded: unknown): unknown {
    return isBaseConstructor(loaded) ? loaded : (loaded as { default?: unknown } | null)?.default;
}

/** `createDiagram` is public API on bpmn-js `Modeler` only. */
export function surfaceBaseKind(base: unknown): SurfaceBaseKind {
    return typeof (base as BaseShape).prototype?.createDiagram === "function"
        ? "modeler"
        : "viewer";
}
