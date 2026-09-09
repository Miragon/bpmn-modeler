/**
 * View / Design / Implement sessions with consumer-supplied surface factories.
 * The optional mode strip needs `@miragon/bpmn-modeler/mode.css`.
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

// Local wrappers prevent API Extractor from emitting bundled function bodies into declarations.
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
