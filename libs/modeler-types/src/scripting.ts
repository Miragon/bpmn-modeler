/**
 * Distinguishes the surface a virtual script editor was opened from so the
 * extension host can pick the right type stubs and the webview can write the
 * update back to the correct moddle property.
 *
 * - `script-task`: `bpmn:ScriptTask`'s direct `script` string property.
 * - `execution-listener`: `camunda:ExecutionListener` at `listenerIndex`.
 * - `task-listener`: `camunda:TaskListener` at `listenerIndex` (UserTask only).
 */
export type ScriptKind = "script-task" | "execution-listener" | "task-listener";

/**
 * Identifies a single inline script that currently has an editor tab open on
 * the host, so the webview can lock the matching properties-panel field.
 *
 * `fileName` is the host editor's tab name (last URI/path segment) — shown in
 * the "being edited in …" hint so the user knows which tab owns the write.
 * The `(elementId, kind, listenerIndex)` triple is the same addressing scheme
 * `UpdateScriptContentQuery` uses, so the webview can key the lock on it.
 */
export interface OpenScriptEditorRef {
    readonly elementId: string;
    readonly kind: ScriptKind;
    readonly listenerIndex: number | undefined;
    readonly fileName: string;
}

/**
 * One inline script-task entry in an `OpenScriptEditorsCommand` batch.
 *
 * Only `script-task` is in scope for the bulk command, so — unlike
 * `OpenScriptEditorCommand` — there is no `kind`/`listenerIndex`/
 * `eventName`; the host fills those in with the script-task defaults.
 */
export interface ScriptTaskScript {
    readonly elementId: string;
    readonly scriptFormat: string;
    readonly content: string;
}
