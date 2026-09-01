import { detectEngine as detectEngineCore, type DetectedEngine } from "@miragon/bpmn-modeler-types";

export type { DetectedEngine };

/**
 * Detects the Camunda engine from raw BPMN XML using the spec-defined
 * `modeler:executionPlatform` / `modeler:executionPlatformVersion` metadata, so
 * a host can pick the {@link createModeler} `engine` before instantiating a
 * modeler.
 *
 * Returns `undefined` for engine-neutral diagrams that carry no platform
 * metadata — the caller owns the fallback policy.
 *
 * Thin local wrapper over the shared helper so the rolled-up `.d.ts` emits a
 * clean ambient signature instead of inlining the implementation body.
 */
export function detectEngine(xml: string): DetectedEngine {
    return detectEngineCore(xml);
}
