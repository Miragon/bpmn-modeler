import { isTextEditingSurface } from "@miragon/bpmn-modeler-types";

/** bpmn-js editor actions a host may drive programmatically. */
export type HostEditorAction = "undo" | "redo";

declare global {
    interface Window {
        /**
         * Lets a host run undo/redo when it can't deliver the keystroke to
         * bpmn-js itself. The IntelliJ JCEF host swallows Ctrl+Z / Ctrl+Y at the
         * IDE level before the canvas ever sees them, so it calls this instead.
         */
        __modelerTriggerEditorAction?: (action: HostEditorAction) => void;
    }
}

/**
 * Installs {@link Window.__modelerTriggerEditorAction}.
 *
 * Text-editing surfaces never reach the diagram's command stack: while the
 * caret sits in a property field, a host-issued undo runs the browser's native
 * text undo instead — mirroring how a real Ctrl+Z would be owned by the focused
 * input rather than the canvas. Since the host swallowed the real keystroke,
 * skipping outright would leave the chord doing nothing at all until the field
 * is blurred. The action names double as `execCommand` ids.
 *
 * @param trigger Runs the bpmn-js editor action (typically
 *   `editorActions.trigger(action)`).
 */
export function installHostEditorActions(trigger: (action: HostEditorAction) => void): void {
    window.__modelerTriggerEditorAction = (action) => {
        if (isTextEditingSurface(document.activeElement)) {
            document.execCommand?.(action);
            return;
        }
        trigger(action);
    };
}
