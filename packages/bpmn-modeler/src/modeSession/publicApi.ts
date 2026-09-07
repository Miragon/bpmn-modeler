import type { DetectedEngine, SurfaceMode } from "@miragon/bpmn-modeler-types";
import type { ModelerMode, ThemeMode } from "../publicApi";
import type { BpmnModelerHandle } from "../publicApi";
import type { BpmnViewerHandle } from "../viewer/publicApi";
import type { BpmnDesignerHandle } from "../design/publicApi";

/**
 * The public TypeScript surface of `@miragon/bpmn-modeler/mode`: the
 * View ↔ Design ↔ Implement session that owns the single live surface for a BPMN
 * page and switches it between modes, plus the opt-in segmented-control strip.
 *
 * `/mode` value-imports **no** bpmn-js / Camunda code — the consumer injects the
 * per-mode surface factories (`createViewer` / `createDesigner` / `createModeler`),
 * so a consumer that supplies one factory gets one mode and no buttons. The strip
 * ({@link mountModeStrip}) is a separate export that only renders a group when two
 * or more modes are available. See ADR 0021.
 */

/** Any of the three surfaces the session can hold; the modeler is the superset. */
export type SurfaceHandle = BpmnViewerHandle | BpmnDesignerHandle | BpmnModelerHandle;

/** What every surface factory receives: where to mount, the detected engine, the theme. */
export interface SurfaceContext {
    container: HTMLElement;
    engine: DetectedEngine;
    theme: ThemeMode;
}

/**
 * The {@link SurfaceFactories.implement} context — a full modeler serves both
 * Design and Implement on a tagged model, so it is told which one to open with.
 */
export interface ModelerSurfaceContext extends SurfaceContext {
    mode: ModelerMode;
}

/**
 * The per-mode surface factories a consumer injects. Each is optional: the set
 * that is present decides which modes the session offers (and therefore which
 * buttons the strip renders). A surface's availability also honours the engine
 * rule (`implement` needs a tagged model).
 */
export interface SurfaceFactories {
    /** Readonly viewer for View. */
    view?: (ctx: SurfaceContext) => Promise<BpmnViewerHandle>;
    /** Engine-neutral editor; served for Design on an untagged model. */
    design?: (ctx: SurfaceContext) => Promise<BpmnDesignerHandle>;
    /** Full modeler; on a tagged model it serves Design *and* Implement via `ctx.mode`. */
    implement?: (ctx: ModelerSurfaceContext) => Promise<BpmnModelerHandle>;
}

/** How a mode change was applied — see {@link ModeSessionOptions.onModeChanged}. */
export type ModeTransition = "toggle" | "recreate" | "fallback";

export interface ModeSessionOptions {
    /** The shared canvas container every surface mounts into. */
    container: HTMLElement;
    /** The detected execution platform, or `undefined` for an untagged model. */
    engine: DetectedEngine;
    /** The per-mode surface factories; the present set decides available modes. */
    surfaces: SurfaceFactories;
    /**
     * The requested initial mode (saved mode / host default / `?mode=`), vetted
     * by `resolveInitialMode` against the available set and the engine rule.
     */
    initialMode?: string | null;
    /** Colour theme forwarded to every surface and `setTheme`; defaults to `"automatic"`. */
    theme?: ThemeMode;
    /**
     * Fires after each factory returns (initial, recreate, fallback) and before
     * `loadDiagram` — the place to rebind per-instance subscriptions.
     */
    onSurfaceCreated?: (handle: SurfaceHandle, mode: SurfaceMode) => void;
    /**
     * Fires once per applied change: `"toggle"` for a live `setMode`, `"recreate"`
     * for a new instance, `"fallback"` for a post-destroy recovery.
     */
    onModeChanged?: (mode: SurfaceMode, transition: ModeTransition) => void;
    /** Fires when a recreate enters/leaves its handle-less window. */
    onSwitchStateChanged?: (busy: boolean) => void;
    /** Runs before `destroy()` on a recreate — the place for a host to flush pending sync. */
    beforeDestroy?: () => void | Promise<void>;
    /** Fires when a switch fails (both the export-failure and post-destroy paths). */
    onError?: (error: unknown) => void;
}

export interface ModeSession {
    /** The mode of the live surface. */
    getMode(): SurfaceMode;
    /** The live surface handle. */
    getHandle(): SurfaceHandle;
    /** The modes the injected factories offer for this engine — what the strip renders. */
    availableModes(): readonly SurfaceMode[];
    /** Whether `mode` is offered for this engine. */
    isAvailable(mode: SurfaceMode): boolean;
    /**
     * Requests a switch to `mode`. Ignored when unavailable, a no-op transition,
     * or a switch is in flight; the returned promise resolves once applied.
     */
    requestMode(mode: SurfaceMode): Promise<void>;
    /** Switches the colour theme on the live surface (and future ones). */
    setTheme(theme: ThemeMode): void;
    /** Tears the live surface down. */
    destroy(): void;
}
