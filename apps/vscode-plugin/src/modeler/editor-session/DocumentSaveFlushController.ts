import { ExtensionContext, workspace } from "vscode";

import {
    BpmnModelerService,
    DmnModelerService,
    DocumentFlushService,
    EditorSessionStore,
    FormModelerService,
} from "@miragon/bpmn-modeler-core";
import type { VsCodeNotifier } from "../../shared/infrastructure/VsCodeNotifier";

type ModelerService = BpmnModelerService | DmnModelerService | FormModelerService;

export type EditorFlushResult =
    { status: "safe"; session: object } | { status: "unavailable" } | { status: "closed" };

/**
 * Closes the save-time staleness gap in outbound webview synchronization.
 *
 * BPMN and DMN coalesce model changes into a debounced full-document sync; Form
 * posts immediately but keeps a short delivery guard. In both cases the host
 * buffer can briefly trail the live webview when save begins.
 * On `onWillSaveTextDocument` this controller round-trips a flush to the webview
 * and writes the freshest content back *before* VS Code persists.
 *
 * Two non-obvious design choices:
 *
 * - `waitUntil` + a guarded `service.sync`, not returned `TextEdit[]`. Text edits
 *   are applied by VS Code outside our echo guard, so the resulting document-change
 *   event would trigger `display()` and force a full webview re-import mid-save.
 *   Writing through `service.sync` holds the session guard across `applyEdit`, so
 *   the echo is suppressed and a byte-identical write no-ops.
 * - the `pending()` gate lives in the webview responder. A nothing-pending reply
 *   carries no duplicate export, but the save still drains the editor queue so
 *   a sync posted just before that reply finishes before persistence.
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
        private readonly formService: FormModelerService,
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
                event.waitUntil(this.flush(editorId));
            }),
        );
    }

    /** Flushes pending changes without crossing into a replacement editor session. */
    async flush(editorId: string, destructive = false): Promise<EditorFlushResult> {
        const session = this.editorStore.captureEditorSession(editorId);
        if (!session) return { status: "closed" };

        const service = this.serviceFor(editorId);
        if (!service) return { status: "unavailable" };

        try {
            const result = destructive
                ? await this.flushSvc.requestFlush(editorId, { destructive: true })
                : await this.flushSvc.requestFlush(editorId);
            if (!this.editorStore.isCurrentEditorSession(editorId, session)) {
                if (destructive) this.flushSvc.releaseFlush(editorId, session);
                return { status: "closed" };
            }
            if (result.status === "unavailable") {
                await this.editorStore.waitForEditorQueue(editorId);
                if (destructive) this.flushSvc.releaseFlush(editorId, session);
                return result;
            }
            if (result.status === "host-updated") {
                return { status: "safe", session };
            }
            if (result.status === "clean") {
                await this.editorStore.waitForEditorQueue(editorId);
                if (!this.editorStore.isCurrentEditorSession(editorId, session)) {
                    if (destructive) this.flushSvc.releaseFlush(editorId, session);
                    return { status: "closed" };
                }
                if (!this.editorStore.isLatestDocumentSyncApplied(editorId, session)) {
                    if (destructive) this.flushSvc.releaseFlush(editorId, session);
                    return { status: "unavailable" };
                }
                return { status: "safe", session };
            }

            await this.editorStore.runInEditorQueue(editorId, () =>
                service.sync(editorId, result.content, result.documentRevision),
            );
            if (!this.editorStore.isCurrentEditorSession(editorId, session)) {
                if (destructive) this.flushSvc.releaseFlush(editorId, session);
                return { status: "closed" };
            }
            if (!this.editorStore.documentMatches(editorId, session, result.content)) {
                if (destructive) this.flushSvc.releaseFlush(editorId, session);
                return { status: "unavailable" };
            }
            this.editorStore.recordDocumentSync(editorId, session, result.content);
            return { status: "safe", session };
        } catch (error) {
            if (destructive) this.flushSvc.releaseFlush(editorId, session);
            this.notifier.logError(error instanceof Error ? error : new Error(String(error)));
            return { status: "unavailable" };
        }
    }

    release(editorId: string, session: object): void {
        this.flushSvc.releaseFlush(editorId, session);
    }

    private serviceFor(editorId: string): ModelerService | undefined {
        if (editorId.endsWith(".bpmn")) return this.bpmnService;
        if (editorId.endsWith(".dmn")) return this.dmnService;
        if (editorId.endsWith(".form")) return this.formService;
        return undefined;
    }
}
