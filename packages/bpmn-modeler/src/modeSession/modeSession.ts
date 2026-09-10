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

function canToggleMode(handle: SurfaceHandle): handle is SurfaceHandle & {
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
    try {
        options.onSurfaceCreated?.(handle, currentMode);
    } catch (error) {
        handle.destroy();
        throw error;
    }

    let busy = false;
    let disposed = false;
    // The in-flight recreate transaction, or null when idle. `busy` already drops
    // concurrent requests, so at most one exists; `disposed` is terminal. Should
    // #1499 change drop-while-busy to supersede, a per-op token would be needed.
    let inFlight: Promise<void> | null = null;

    function safeDestroy(surface: SurfaceHandle | null): void {
        try {
            surface?.destroy();
        } catch (error) {
            if (!disposed) {
                options.onError?.(error);
            }
        }
    }

    function buildSurface(mode: SurfaceMode): Promise<SurfaceHandle> {
        const base: SurfaceContext = { container, engine, theme };
        if (mode === "view") {
            return surfaces.view!(base);
        }
        if (mode === "implement") {
            const context: ModelerSurfaceContext = { ...base, mode: "implement" };
            return surfaces.implement!(context);
        }
        if (engine !== undefined && surfaces.implement) {
            const context: ModelerSurfaceContext = { ...base, mode: "design" };
            return surfaces.implement(context);
        }
        return surfaces.design!(base);
    }

    function isAvailable(mode: SurfaceMode): boolean {
        return available.includes(mode);
    }

    async function requestMode(target: SurfaceMode): Promise<void> {
        if (disposed || !isAvailable(target) || busy) {
            return;
        }
        const kind = planTransition(currentMode, target, engine);
        if (kind === "none") {
            return;
        }
        if (kind === "toggle" && canToggleMode(handle)) {
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
        inFlight = runSwitch(target);
        try {
            await inFlight;
        } finally {
            inFlight = null;
            busy = false;
            if (!disposed) {
                options.onSwitchStateChanged?.(false);
            }
        }
    }

    async function runSwitch(target: SurfaceMode): Promise<void> {
        const original = handle;
        let snapshot: ReturnType<SurfaceHandle["captureViewState"]>;
        let xml: string;

        // Phase 1 — the original stays authoritative until we are certain we can
        // proceed, so a throw here leaves exactly one live surface (the original).
        try {
            snapshot = original.captureViewState();
            xml = await original.exportDiagram();
            if (disposed) {
                safeDestroy(original);
                return;
            }
            await options.beforeDestroy?.();
            if (disposed) {
                safeDestroy(original);
                return;
            }
        } catch (error) {
            if (disposed) {
                safeDestroy(original);
                return;
            }
            options.onError?.(error);
            return;
        }

        // Phase 2 — point of no return: the original is gone from here on.
        original.destroy();

        // Phase 3 — stand up the candidate; any failure destroys it and falls back.
        let candidate: SurfaceHandle | null = null;
        try {
            candidate = await buildSurface(target);
            if (disposed) {
                safeDestroy(candidate);
                return;
            }
            handle = candidate;
            currentMode = target;
            options.onSurfaceCreated?.(handle, target);
            await handle.loadDiagram(xml);
            if (disposed) {
                safeDestroy(candidate);
                return;
            }
            handle.applyViewState(snapshot);
            options.onModeChanged?.(target, "recreate");
        } catch (error) {
            safeDestroy(candidate);
            if (disposed) {
                return;
            }
            options.onError?.(error);
            await buildFallback(xml);
        }
    }

    async function buildFallback(xml: string): Promise<void> {
        const fallback = defaultMode(engine, available);
        let surface: SurfaceHandle | null = null;
        try {
            surface = await buildSurface(fallback);
            if (disposed) {
                safeDestroy(surface);
                return;
            }
            handle = surface;
            currentMode = fallback;
            options.onSurfaceCreated?.(handle, fallback);
            await handle.loadDiagram(xml);
            if (disposed) {
                safeDestroy(surface);
                return;
            }
            options.onModeChanged?.(fallback, "fallback");
        } catch (error) {
            // A double failure escapes nowhere: the session simply holds no live
            // surface until the next requestMode rebuilds one.
            safeDestroy(surface);
            if (!disposed) {
                options.onError?.(error);
            }
        }
    }

    return {
        getMode: () => currentMode,
        getHandle: () => handle,
        availableModes: () => available,
        isAvailable,
        requestMode,
        setTheme: (next: ThemeMode) => {
            if (disposed) {
                return;
            }
            theme = next;
            handle.setTheme(next);
        },
        destroy: async () => {
            if (disposed) {
                return;
            }
            disposed = true;
            if (inFlight) {
                // The transaction destroys whichever surface it owns at its next checkpoint.
                await inFlight;
            } else {
                handle.destroy();
            }
        },
    };
}

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
        return (
            (engine !== undefined && surfaces.implement !== undefined) ||
            surfaces.design !== undefined
        );
    });
}
