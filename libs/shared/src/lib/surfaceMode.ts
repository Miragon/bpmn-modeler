import type { DetectedEngine } from "@miragon/bpmn-modeler-types";

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

/** Human-readable label for the segmented control. */
export const MODE_LABEL: Record<SurfaceMode, string> = {
    view: "View",
    design: "Design",
    implement: "Implement",
};

/** Single-letter badge shown on the collapsed-panel rail. */
export const MODE_BADGE: Record<SurfaceMode, string> = {
    view: "V",
    design: "D",
    implement: "I",
};

/** Tooltip on the Implement button when the model carries no execution platform. */
export const IMPLEMENT_UNAVAILABLE_HINT =
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.";

/**
 * Whether a mode can be entered for the given engine. `view` and `design` are
 * engine-neutral and always available; `implement` needs a detected engine
 * (an execution-platform-tagged model).
 */
export function isModeAvailable(mode: SurfaceMode, engine: DetectedEngine): boolean {
    return mode === "implement" ? engine !== undefined : true;
}

/**
 * The default landing mode: Implement for a tagged model (its authoring intent),
 * Design for an untagged one.
 */
export function defaultMode(engine: DetectedEngine): SurfaceMode {
    return engine !== undefined ? "implement" : "design";
}

/**
 * Resolves the initial mode from an optional request (a saved mode, host
 * default, or `?mode=`), falling back to {@link defaultMode} when the request is
 * absent, unrecognised, or unavailable for this engine (e.g. `implement` on an
 * untagged model).
 */
export function resolveInitialMode(requested: string | null, engine: DetectedEngine): SurfaceMode {
    if (
        requested !== null &&
        (SURFACE_MODES as readonly string[]).includes(requested) &&
        isModeAvailable(requested as SurfaceMode, engine)
    ) {
        return requested as SurfaceMode;
    }
    return defaultMode(engine);
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
