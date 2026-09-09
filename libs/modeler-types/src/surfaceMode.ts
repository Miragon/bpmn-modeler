import type { DetectedEngine } from "./engine";

/**
 * The three canvas-side modes a host webview exposes on the BPMN modeler page.
 *
 * - `view` — the readonly `/viewer` surface.
 * - `design` — the engine-neutral, editable `/design` surface.
 * - `implement` — the full Camunda modeler (`createModeler`), only available for
 *   a model that carries an execution platform.
 */
export type SurfaceMode = "view" | "design" | "implement";

export const SURFACE_MODES: readonly SurfaceMode[] = ["view", "design", "implement"];

/**
 * Whether a mode can be entered for the given engine. `view` and `design` are
 * engine-neutral and always available; `implement` needs a detected engine
 * (an execution-platform-tagged model).
 */
export function isModeAvailable(mode: SurfaceMode, engine: DetectedEngine): boolean {
    return mode === "implement" ? engine !== undefined : true;
}

/**
 * The default landing mode, resolved *within* the consumer's supplied set: the
 * authoring intent for a tagged model is Implement, else Design, else View, else
 * the first available mode. `available` defaults to all three, so a caller that
 * offers every mode keeps the historical behaviour (tagged ⇒ Implement, untagged
 * ⇒ Design).
 */
export function defaultMode(
    engine: DetectedEngine,
    available: readonly SurfaceMode[] = SURFACE_MODES,
): SurfaceMode {
    const has = (mode: SurfaceMode): boolean => available.includes(mode);
    if (engine !== undefined && has("implement")) return "implement";
    if (has("design")) return "design";
    if (has("view")) return "view";
    return available[0] ?? "design";
}

/**
 * Resolves the initial mode from an optional request (a saved mode, host
 * default, or `?mode=`), falling back to {@link defaultMode} when the request is
 * absent, unrecognised, outside the supplied `available` set, or unavailable for
 * this engine (e.g. `implement` on an untagged model).
 */
export function resolveInitialMode(
    requested: string | null,
    engine: DetectedEngine,
    available: readonly SurfaceMode[] = SURFACE_MODES,
): SurfaceMode {
    if (
        requested !== null &&
        (SURFACE_MODES as readonly string[]).includes(requested) &&
        available.includes(requested as SurfaceMode) &&
        isModeAvailable(requested as SurfaceMode, engine)
    ) {
        return requested as SurfaceMode;
    }
    return defaultMode(engine, available);
}

/** How a mode change is carried out — see the host's mode session. */
export type TransitionKind = "none" | "toggle" | "recreate";

/**
 * Plans the cheapest transition between two modes:
 * - `none` — same mode, nothing to do.
 * - `toggle` — Design↔Implement on a tagged model, done live via
 *   `handle.setMode` (undo/selection/plane survive).
 * - `recreate` — anything involving `view`, or Design↔Implement on an untagged
 *   model: destroy the instance and stand up the target factory.
 */
export function planTransition(
    from: SurfaceMode,
    to: SurfaceMode,
    engine: DetectedEngine,
): TransitionKind {
    if (from === to) {
        return "none";
    }
    const bothEditor = from !== "view" && to !== "view";
    if (bothEditor && engine !== undefined) {
        return "toggle";
    }
    return "recreate";
}
