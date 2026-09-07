import {
    SURFACE_MODES,
    defaultMode,
    isModeAvailable,
    planTransition,
    resolveInitialMode,
    type SurfaceMode,
} from "@miragon/bpmn-modeler-types";
import type { ModelerMode, ThemeMode } from "../publicApi";
import type {
    ModeSession,
    ModeSessionOptions,
    ModelerSurfaceContext,
    SurfaceContext,
    SurfaceFactories,
    SurfaceHandle,
} from "./publicApi";

/** The live handle carries the design/implement toggle only when it is a modeler. */
function canToggle(handle: SurfaceHandle): handle is SurfaceHandle & {
    setMode(mode: ModelerMode): void;
    getMode(): ModelerMode;
} {
    return "setMode" in handle;
}

/**
 * Owns the single live surface for a BPMN page and switches it between modes. A
 * Design↔Implement change on a tagged model is a live `setMode` toggle
 * (undo/selection/plane survive); anything else destroys the instance and stands
 * up the target factory, handing the captured view state over. Switch requests
 * that arrive while a recreate is in flight are dropped — the consumer's own
 * operation queue (if any) is the single serialisation point.
 */
export async function createModeSession(options: ModeSessionOptions): Promise<ModeSession> {
    const { container, engine, surfaces } = options;
    let theme: ThemeMode = options.theme ?? "automatic";

    const available = computeAvailableModes(surfaces, engine);
    if (available.length === 0) {
        throw new Error(
            "createModeSession: no surface factory is available for this engine — " +
                "supply at least one of view / design / implement.",
        );
    }

    let currentMode = resolveInitialMode(options.initialMode ?? null, engine, available);
    let handle = await buildSurface(currentMode);
    options.onSurfaceCreated?.(handle, currentMode);

    let busy = false;

    /** Stands up the surface for `mode`, routing Design to the modeler on a tagged model. */
    function buildSurface(mode: SurfaceMode): Promise<SurfaceHandle> {
        const base: SurfaceContext = { container, engine, theme };
        if (mode === "view") {
            return surfaces.view!(base);
        }
        if (mode === "implement") {
            const ctx: ModelerSurfaceContext = { ...base, mode: "implement" };
            return surfaces.implement!(ctx);
        }
        // Design: the full modeler serves it on a tagged model, else the designer.
        if (engine !== undefined && surfaces.implement) {
            const ctx: ModelerSurfaceContext = { ...base, mode: "design" };
            return surfaces.implement(ctx);
        }
        return surfaces.design!(base);
    }

    function isAvailable(mode: SurfaceMode): boolean {
        return available.includes(mode);
    }

    async function requestMode(target: SurfaceMode): Promise<void> {
        if (!isAvailable(target) || busy) {
            return;
        }
        const kind = planTransition(currentMode, target, engine);
        if (kind === "none") {
            return;
        }
        if (kind === "toggle" && canToggle(handle)) {
            handle.setMode(target as ModelerMode);
            // The handle is the single source of truth for the applied mode.
            currentMode = handle.getMode();
            options.onModeChanged?.(currentMode, "toggle");
            return;
        }
        await recreate(target);
    }

    async function recreate(target: SurfaceMode): Promise<void> {
        busy = true;
        options.onSwitchStateChanged?.(true);

        // Captured before the destroy so the view state survives the swap; kept
        // in scope so the fallback path can re-import the same diagram.
        const snapshot = handle.captureViewState();
        let xml: string;
        try {
            xml = await handle.exportDiagram();
        } catch (error) {
            // Nothing destroyed yet — keep the instance and surface the error.
            busy = false;
            options.onSwitchStateChanged?.(false);
            options.onError?.(error);
            return;
        }

        try {
            await options.beforeDestroy?.();
            handle.destroy();
            handle = await buildSurface(target);
            currentMode = target;
            options.onSurfaceCreated?.(handle, target);
            await handle.loadDiagram(xml);
            handle.applyViewState(snapshot);
            options.onModeChanged?.(target, "recreate");
        } catch (error) {
            // Past the destroy — the page must never be handle-less.
            options.onError?.(error);
            const fallback = defaultMode(engine, available);
            handle = await buildSurface(fallback);
            currentMode = fallback;
            options.onSurfaceCreated?.(handle, fallback);
            await handle.loadDiagram(xml);
            options.onModeChanged?.(fallback, "fallback");
        } finally {
            busy = false;
            options.onSwitchStateChanged?.(false);
        }
    }

    return {
        getMode: () => currentMode,
        getHandle: () => handle,
        availableModes: () => available,
        isAvailable,
        requestMode,
        setTheme: (next: ThemeMode) => {
            theme = next;
            handle.setTheme(next);
        },
        destroy: () => handle.destroy(),
    };
}

/**
 * The modes the injected factories offer for this engine, in canonical order. A
 * mode is available when its routed factory exists and the engine rule permits
 * it: View needs `view`; Design needs the modeler (tagged model) or the designer;
 * Implement needs the modeler *and* a tagged model.
 */
function computeAvailableModes(
    surfaces: SurfaceFactories,
    engine: SurfaceContext["engine"],
): readonly SurfaceMode[] {
    return SURFACE_MODES.filter((mode) => {
        if (!isModeAvailable(mode, engine)) {
            return false;
        }
        if (mode === "view") {
            return surfaces.view !== undefined;
        }
        if (mode === "implement") {
            return surfaces.implement !== undefined;
        }
        // Design routes to the modeler on a tagged model, else the designer.
        return (
            (engine !== undefined && surfaces.implement !== undefined) ||
            surfaces.design !== undefined
        );
    });
}
