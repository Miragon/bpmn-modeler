import {
    DocumentFlushedCommand,
    DocumentFlushResult,
    FlushDocumentQuery,
} from "@miragon/bpmn-modeler-shared";

import { NotifierPort } from "../domain/hostPorts";
import { EditorSessionStore } from "../infrastructure/EditorSessionStore";
import { MessageHandler } from "../infrastructure/WebviewMessageRouter";

/**
 * Host-side half of the flush protocol: round-trips a {@link FlushDocumentQuery}
 * to a webview and resolves with the XML the webview flushes back, so a
 * save/close path can persist the freshest document instead of racing the
 * webview's outbound sync debounce.
 *
 * Host-agnostic by construction — it names only `setTimeout`, the shared
 * messages, the editor store, and the logger port — so the VS Code save hook and
 * the IntelliJ close hook can both drive it. `requestFlush` **never rejects** and
 * returns an explicit result so save paths can remain best-effort while teardown
 * paths fail closed on timeout, delivery, or export failure.
 */
export class DocumentFlushService {
    private nextToken = 1;

    /**
     * One outstanding request per editor. A second `requestFlush` for the same
     * editor supersedes the first (resolving it as failed) so a stale reply
     * can never satisfy the newer request. `token` disambiguates a late reply
     * that arrives after this entry was replaced or timed out.
     */
    private readonly pending = new Map<
        string,
        { token: number; settle(result: DocumentFlushResult): void }
    >();

    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly notifier: NotifierPort,
    ) {}

    /**
     * Asks the webview owning `editorId` to flush and resolves with an explicit
     * idle, flushed, or failed result. Never rejects.
     */
    requestFlush(editorId: string, timeoutMs = 500): Promise<DocumentFlushResult> {
        // Supersede any in-flight request for this editor before issuing a new
        // token, so only the latest request can be satisfied.
        this.pending.get(editorId)?.settle({ status: "failed" });

        const token = this.nextToken++;
        return new Promise<DocumentFlushResult>((resolve) => {
            const settle = (result: DocumentFlushResult): void => {
                clearTimeout(timer);
                // Only clear the map slot if it still holds *this* request; a
                // superseding request may already have taken ownership.
                if (this.pending.get(editorId)?.token === token) {
                    this.pending.delete(editorId);
                }
                resolve(result);
            };
            this.pending.set(editorId, { token, settle });
            const timer = setTimeout(() => settle({ status: "failed" }), timeoutMs);
            // postMessage can reject (hidden VS Code webview throws "The active
            // editor is hidden.") or throw synchronously (requireHandle for an
            // already-gone editor). Both produce an explicit failed result.
            try {
                void this.editorStore
                    .postMessage(editorId, new FlushDocumentQuery(token))
                    .catch(() => settle({ status: "failed" }));
            } catch {
                settle({ status: "failed" });
            }
        });
    }

    /**
     * Resolves the matching outstanding request with the flushed content. A
     * reply with no matching entry or a mismatched token is a stale reply that
     * arrived after the request timed out or was superseded — logged and dropped.
     */
    handleReply(command: DocumentFlushedCommand, editorId: string): void {
        const entry = this.pending.get(editorId);
        if (!entry || entry.token !== command.token) {
            this.notifier.logDebug(
                `Ignoring stale DocumentFlushedCommand (token ${command.token}) for ${editorId}`,
            );
            return;
        }
        entry.settle(command.result);
    }
}

/**
 * Router handler for `DocumentFlushedCommand` — routes the webview's flush reply
 * back to the outstanding {@link DocumentFlushService.requestFlush} promise.
 */
export function documentFlushedHandler(svc: DocumentFlushService): MessageHandler {
    return (message, editorId) => {
        svc.handleReply(message as DocumentFlushedCommand, editorId);
    };
}
