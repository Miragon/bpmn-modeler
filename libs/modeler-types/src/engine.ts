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
