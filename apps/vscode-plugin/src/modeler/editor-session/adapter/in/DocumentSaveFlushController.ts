import { ExtensionContext, workspace } from "vscode";

import { EditorSessionStore, PendingEditsFlush } from "@miragon/bpmn-modeler-core";

/**
 * Closes the save-time staleness gap in outbound webview synchronization: on
 * `onWillSaveTextDocument` the {@link PendingEditsFlush} writes the webview's
 * freshest content into the buffer *before* VS Code persists.
 *
 * `waitUntil` + a guarded modeler sync, not returned `TextEdit[]`. Text edits
 * are applied by VS Code outside our echo guard, so the resulting document-change
 * event would trigger `display()` and force a full webview re-import mid-save.
 * Writing through the modeler's sync holds the session guard across `applyEdit`,
 * so the echo is suppressed and a byte-identical write no-ops.
 *
 * Save-participant budget: VS Code gives each listener ~1.5s with a
 * 3-strikes-ignored policy; the flush's 500ms timeout leaves ~2x margin. It runs
 * for every `TextDocumentSaveReason` including `AfterDelay` (autosave is exactly
 * when the buffer lags a live edit stream).
 */
export class DocumentSaveFlushController {
    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly pendingEdits: Pick<PendingEditsFlush, "flushIntoDocument">,
    ) {}

    register(context: ExtensionContext): void {
        context.subscriptions.push(
            workspace.onWillSaveTextDocument((event) => {
                const editorId = event.document.uri.toString();
                // Only modeler-owned documents are tracked; diff panes are never
                // registered, so this also excludes them.
                if (!this.editorStore.getEditorIds().includes(editorId)) {
                    return;
                }
                event.waitUntil(this.pendingEdits.flushIntoDocument(editorId));
            }),
        );
    }
}
