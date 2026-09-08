/**
 * Public result and diagnostic types for diagram formatting and cleanup.
 *
 * They live here rather than in `@miragon/bpmn-modeler-layout` so the private
 * host protocol can name them in its message payloads without taking a
 * dependency on the layout implementation.
 */

/**
 * Why a format run refused to touch the diagram.
 *
 * The taxonomy is ours: the layout engine ships no diagnostics we could map
 * one-to-one, so every refusal originates in our own pre-flight check and
 * `ENGINE_FAILED` is the single catch-all for a throwing engine.
 */
export type LayoutErrorCode =
    "UNSUPPORTED_SURFACE" | "UNSUPPORTED_DRILLDOWN" | "EMPTY_DIAGRAM" | "ENGINE_FAILED";

/** A non-fatal remark from the engine; formatting proceeded regardless. */
export interface LayoutDiagnostic {
    readonly message: string;
    readonly elementId?: string;
}

export type LayoutStatus = "formatted" | "unchanged" | "failed";

/** What one class of garbage found by the cleanup analysis looks like. */
export type CleanupKind =
    | "orphan-di"
    | "duplicate-di"
    | "dangling-plane"
    | "empty-label-di"
    | "duplicate-waypoints"
    | "collinear-waypoints"
    | "dangling-flow"
    | "stale-flow-node-ref"
    | "isolated-node"
    | "empty-container";

/**
 * One removable finding. `id` is absent for anonymous DI (a `BPMNShape`
 * without a resolvable `bpmnElement` may carry no id of its own).
 */
export interface CleanupItem {
    readonly kind: CleanupKind;
    readonly id?: string;
    readonly label: string;
}
