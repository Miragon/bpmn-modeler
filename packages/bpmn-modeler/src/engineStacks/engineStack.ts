import type { ModuleDeclaration } from "didi";
import type { PopupMenuAnnotationOverrides } from "../popupMenuAnnotations";

export interface EngineStack {
    /** Upstream engine plugins wrapped in the shared modules, in registration order. */
    readonly upstreamModules: readonly ModuleDeclaration[];
    /** DI modules only this engine registers, placed right after the common modules. */
    readonly engineModules: readonly ModuleDeclaration[];
    readonly moddleExtensions: Readonly<Record<string, unknown>>;
    readonly propertiesPanelDefaults: Readonly<Record<string, unknown>>;
    /** Where the engine's semantics differ from the engine-neutral popup-menu annotations. */
    readonly popupMenuAnnotations: PopupMenuAnnotationOverrides;
}
