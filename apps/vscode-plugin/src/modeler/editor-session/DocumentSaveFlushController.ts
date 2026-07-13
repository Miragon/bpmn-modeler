import { ExtensionContext, workspace } from "vscode";

import {
    BpmnModelerService,
    DmnModelerService,
    DocumentFlushService,
    EditorSessionStore,
} from "@miragon/bpmn-modeler-core";
import type { VsCodeNotifier } from "../../shared/infrastructure/VsCodeNotifier";

/**
 * Closes the save-time staleness gap the outbound sync debounce introduces.
 *
 * The webview coalesces model changes into a debounced full-document sync, so at
 * save time the host buffer can trail the webview by up to the debounce window.
 * On `onWillSaveTextDocument` this controller round-trips a flush to the webview
 * and writes the freshest XML back *before* VS Code persists.
 *
 * Two non-obvious design choices:
 *
 * - `waitUntil(Promise<void>)` + a guarded `service.sync`, not
 *   `waitUntil(Thenable<TextEdit[]>)`. A returned `TextEdit[]` is applied by VS
 *   Code outside our echo guard, so the resulting document-change event would
 *   trigger `display()` and force a full webview re-import mid-save. Writing
 *   through `service.sync` holds the session guard across `applyEdit`, so the
 *   echo is suppressed and a byte-identical write no-ops.
 * - the `pending()` gate lives in the webview responder, so a save that finds
 *   nothing pending resolves `undefined` and leaves the host buffer (which is
 *   authoritative in that case) untouched.
 *
 * Save-participant budget: VS Code gives each listener ~1.5s with a
 * 3-strikes-ignored policy; the flush's 500ms timeout leaves ~2x margin. It runs
 * for every `TextDocumentSaveReason` including `AfterDelay` (autosave is exactly
 * when the buffer lags a live edit stream).
 */
export class DocumentSaveFlushController {
    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly flushSvc: DocumentFlushService,
        private readonly bpmnService: BpmnModelerService,
        private readonly dmnService: DmnModelerService,
        private readonly notifier: VsCodeNotifier,
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
                const service = editorId.endsWith(".bpmn")
                    ? this.bpmnService
                    : editorId.endsWith(".dmn")
                      ? this.dmnService
                      : undefined;
                if (!service) {
                    return;
                }
                event.waitUntil(this.flushThenSync(editorId, service));
            }),
        );
    }

    /**
     * Flushes the webview then writes the returned XML through the guarded sync.
     * Never rejects — a rejected `waitUntil` promise would surface a spurious
     * save error to the user for a best-effort freshness top-up.
     */
    private async flushThenSync(
        editorId: string,
        service: BpmnModelerService | DmnModelerService,
    ): Promise<void> {
        try {
            const xml = await this.flushSvc.requestFlush(editorId);
            if (xml === undefined) {
                return;
            }
            // The editor can close mid-flush; syncing a gone editor would throw
            // in requireHandle. Re-check before writing.
            if (!this.editorStore.getEditorIds().includes(editorId)) {
                return;
            }
            await service.sync(editorId, xml);
        } catch (error) {
            this.notifier.logError(error instanceof Error ? error : new Error(String(error)));
        }
    }
}
