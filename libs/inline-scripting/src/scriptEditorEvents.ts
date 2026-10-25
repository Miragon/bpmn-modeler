import type { ScriptKind } from "@miragon/bpmn-modeler-types";

/**
 * Payload emitted on the `scriptEditor.open` event bus event.
 *
 * `listenerIndex` and `eventName` are present only for listener kinds and
 * disambiguate which of the multiple scripts on a single element is being
 * edited.
 */
export interface OpenScriptEditorEvent {
    readonly elementId: string;
    readonly kind: ScriptKind;
    readonly listenerIndex: number | undefined;
    readonly eventName: string | undefined;
    readonly scriptFormat: string;
    readonly content: string;
}

export const OPEN_SCRIPT_EDITOR_EVENT = "scriptEditor.open";
