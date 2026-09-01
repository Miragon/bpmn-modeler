/**
 * The webview can either host the full editable modeler or a readonly viewer
 * used for side-by-side diff rendering.
 */
export type BpmnViewerMode = "modeler" | "viewer";

/**
 * Camunda engine identifier used by the BPMN modeler.
 *
 * `"c7"` — Camunda Platform 7. `"c8"` — Camunda Cloud 8.
 *
 * Defined as a string union so values stay JSON-serializable across the
 * extension-host ↔ webview message protocol.
 */
export type Engine = "c7" | "c8";

/** Display names for UI surfaces (status bar, pickers, labels). */
export const ENGINE_LABEL: Record<Engine, string> = {
    c7: "Camunda 7",
    c8: "Camunda 8",
};

/**
 * Execution-platform names written into BPMN XML (`modeler:executionPlatform`).
 * These are spec-defined strings — do not change them independently of the BPMN spec.
 */
export const ENGINE_EXECUTION_PLATFORM: Record<Engine, string> = {
    c7: "Camunda Platform",
    c8: "Camunda Cloud",
};

/**
 * Result of {@link detectEngine}: the engine, or `undefined` when the XML
 * carries no recognisable platform metadata.
 */
export type DetectedEngine = Engine | undefined;

/**
 * Detects the Camunda engine from raw BPMN XML using the spec-defined
 * `modeler:*` metadata, so hosts can pick the engine before instantiating a
 * modeler.
 *
 * Strict signals, most authoritative first:
 * 1. `modeler:executionPlatform` name (`"Camunda Platform"` → c7,
 *    `"Camunda Cloud"` → c8).
 * 2. else the `modeler:executionPlatformVersion` major digit (7 → c7, 8 → c8).
 *
 * Returns `undefined` for engine-neutral diagrams — the caller owns the
 * fallback policy. No `xmlns:camunda`/`xmlns:zeebe` heuristic here.
 */
export function detectEngine(xml: string): DetectedEngine {
    for (const engine of Object.keys(ENGINE_EXECUTION_PLATFORM) as Engine[]) {
        if (xml.includes(`modeler:executionPlatform="${ENGINE_EXECUTION_PLATFORM[engine]}"`)) {
            return engine;
        }
    }

    const versionMatch = xml.match(/modeler:executionPlatformVersion="([78])\./);
    if (versionMatch) {
        return versionMatch[1] === "7" ? "c7" : "c8";
    }

    return undefined;
}
