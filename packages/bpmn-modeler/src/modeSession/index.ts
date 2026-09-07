/**
 * `@miragon/bpmn-modeler/mode` — the View ↔ Design ↔ Implement session and its
 * opt-in segmented-control strip.
 *
 * {@link createModeSession} owns the single live surface for a BPMN page and
 * switches it between modes (live `setMode` toggle where possible, otherwise
 * export → destroy → recreate → restore). The consumer injects the per-mode
 * surface factories, so this entry value-imports **no** bpmn-js / Camunda code —
 * a consumer that bundles only `/viewer` never drags the editor stack in. The
 * strip ({@link mountModeStrip}) is a separate export that renders a group only
 * when two or more modes are available. See ADR 0021.
 *
 * Deliberately imports **no CSS**: the strip's sheet ships separately as
 * `@miragon/bpmn-modeler/mode.css` (built by `vite.viewer-css.config.mts`), so a
 * `cssCodeSplit: false` lib build cannot fold it into `dist/bpmn-modeler.css`.
 */

export { createModeSession } from "./modeSession";
export { mountModeStrip, MODE_LABEL, MODE_BADGE, IMPLEMENT_UNAVAILABLE_HINT } from "./modeStrip";
export type { ModeStrip, ModeStripOptions, ModeStripState, ModeStripTranslate } from "./modeStrip";
export type {
    ModeSession,
    ModeSessionOptions,
    ModeTransition,
    ModelerSurfaceContext,
    SurfaceContext,
    SurfaceFactories,
    SurfaceHandle,
} from "./publicApi";

// ── Mode model — re-exported so a consumer needs only this one subpath ────────
// The functions are wrapped in local declarations rather than bare re-exported:
// api-extractor inlines the bundled `@miragon/bpmn-modeler-types` source, and a
// bare `export … from` of a *function* would roll its body into the emitted
// `.d.ts` as an illegal `declare function … {`. A local wrapper emits a clean
// signature (the same shape check-dts's design/viewer entries rely on).
import {
    SURFACE_MODES,
    defaultMode as defaultModeImpl,
    isModeAvailable as isModeAvailableImpl,
    planTransition as planTransitionImpl,
    resolveInitialMode as resolveInitialModeImpl,
    type DetectedEngine,
    type SurfaceMode,
    type TransitionKind,
} from "@miragon/bpmn-modeler-types";

export { SURFACE_MODES };
export type { DetectedEngine, SurfaceMode, TransitionKind };

export function defaultMode(
    engine: DetectedEngine,
    available?: readonly SurfaceMode[],
): SurfaceMode {
    return defaultModeImpl(engine, available);
}

export function isModeAvailable(mode: SurfaceMode, engine: DetectedEngine): boolean {
    return isModeAvailableImpl(mode, engine);
}

export function planTransition(
    from: SurfaceMode,
    to: SurfaceMode,
    engine: DetectedEngine,
): TransitionKind {
    return planTransitionImpl(from, to, engine);
}

export function resolveInitialMode(
    requested: string | null,
    engine: DetectedEngine,
    available?: readonly SurfaceMode[],
): SurfaceMode {
    return resolveInitialModeImpl(requested, engine, available);
}
