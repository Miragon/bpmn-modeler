import { commands, ExtensionContext, workspace } from "vscode";

import {
    BpmnModelerService,
    DmnModelerService,
    DocumentFlushService,
    EditorSessionStore,
} from "@miragon/bpmn-modeler-core";
import type { VsCodeNotifier } from "../../shared/infrastructure/VsCodeNotifier";

export const FLUSH_DOCUMENT_COMMAND = "bpmn-modeler.flushDocument";

/**
 * Closes the save-time staleness gap the outbound sync debounce introduces.
 *
 * The webview coalesces model changes into a debounced full-document sync, so at
 * save time the host buffer can trail the webview by up to the debounce window.
 * On `onWillSaveTextDocument`, or an explicit host teardown request, this
 * controller round-trips a flush and writes the freshest XML into the buffer.
 *
 * Two non-obvious design choices:
 *
 * - `waitUntil(Promise)` + a guarded `service.sync`, not
 *   `waitUntil(Thenable<TextEdit[]>)`. A returned `TextEdit[]` is applied by VS
 *   Code outside our echo guard, so the resulting document-change event would
 *   trigger `display()` and force a full webview re-import mid-save. Writing
 *   through `service.sync` holds the session guard across `applyEdit`, so the
 *   echo is suppressed and a byte-identical write no-ops.
 * - the `pending()` gate lives in the webview responder, so a save that finds
 *   nothing pending resolves `idle` and leaves the host buffer (which is
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
                const service = this.modelerService(editorId, event.document.languageId);
                if (!service) {
                    return;
                }
                event.waitUntil(this.flushThenSync(editorId, service));
            }),
            commands.registerCommand(
                FLUSH_DOCUMENT_COMMAND,
                async (editorId: string, viewType: string) => {
                    const service = this.modelerService(editorId, viewType);
                    const flushed =
                        !!service &&
                        this.editorStore.getEditorIds().includes(editorId) &&
                        (await this.flushThenSync(editorId, service));
                    if (!flushed) {
                        this.notifier.showError(
                            "Pending changes could not be synchronized, so the editor stayed in its current window.",
                        );
                    }
                    return flushed;
                },
            ),
        );
    }

    private modelerService(
        editorId: string,
        modelerType?: string,
    ): BpmnModelerService | DmnModelerService | undefined {
        if (modelerType === "bpmn" || modelerType === "bpmn-modeler.bpmn") {
            return this.bpmnService;
        }
        if (modelerType === "dmn" || modelerType === "bpmn-modeler.dmn") {
            return this.dmnService;
        }
        const resource = editorId.split(/[?#]/, 1)[0].toLowerCase();
        if (resource.endsWith(".bpmn")) {
            return this.bpmnService;
        }
        if (resource.endsWith(".dmn")) {
            return this.dmnService;
        }
        return undefined;
    }

    /**
     * Flushes the webview then writes the returned XML through the guarded sync.
     * Never rejects — a rejected `waitUntil` promise would surface a spurious
     * save error to the user for a best-effort freshness top-up.
     */
    private async flushThenSync(
        editorId: string,
        service: BpmnModelerService | DmnModelerService,
    ): Promise<boolean> {
        try {
            const result = await this.flushSvc.requestFlush(editorId);
            if (result.status === "idle") {
                return true;
            }
            if (result.status === "failed") {
                return false;
            }
            // The editor can close mid-flush; syncing a gone editor would throw
            // in requireHandle. Re-check before writing.
            if (!this.editorStore.getEditorIds().includes(editorId)) {
                return false;
            }
            await service.sync(editorId, result.content);
            const hostContent = this.editorStore.requireHandle(editorId).getContent();
            return (
                this.editorStore.getEditorIds().includes(editorId) &&
                (hostContent === result.content ||
                    hostContent.replaceAll("\r\n", "\n") ===
                        result.content.replaceAll("\r\n", "\n"))
            );
        } catch (error) {
            this.notifier.logError(error instanceof Error ? error : new Error(String(error)));
            return false;
        }
    }
}
