import { DocumentFlushedCommand, FlushDocumentQuery } from "@miragon/bpmn-modeler-shared";

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
 * the IntelliJ close hook can both drive it. `requestFlush` **never rejects**:
 * every failure mode (timeout, hidden/undeliverable webview, "nothing pending"
 * reply, superseded request) resolves `undefined`, which every caller reads as
 * "leave the host buffer untouched". That is always safe because a missed sync
 * self-heals on the next model change and the host copy is authoritative when
 * the webview reports nothing pending.
 */
export class DocumentFlushService {
    private nextToken = 1;

    /**
     * One outstanding request per editor. A second `requestFlush` for the same
     * editor supersedes the first (resolving it `undefined`) so a stale reply
     * can never satisfy the newer request. `token` disambiguates a late reply
     * that arrives after this entry was replaced or timed out.
     */
    private readonly pending = new Map<string, { token: number; settle(xml?: string): void }>();

    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly notifier: NotifierPort,
    ) {}

    /**
     * Asks the webview owning `editorId` to flush and resolves with its XML, or
     * `undefined` on timeout / undeliverable post / nothing-pending / supersede.
     * Never rejects.
     */
    requestFlush(editorId: string, timeoutMs = 500): Promise<string | undefined> {
        // Supersede any in-flight request for this editor before issuing a new
        // token, so only the latest request can be satisfied.
        this.pending.get(editorId)?.settle(undefined);

        const token = this.nextToken++;
        return new Promise<string | undefined>((resolve) => {
            const settle = (xml?: string): void => {
                clearTimeout(timer);
                // Only clear the map slot if it still holds *this* request; a
                // superseding request may already have taken ownership.
                if (this.pending.get(editorId)?.token === token) {
                    this.pending.delete(editorId);
                }
                resolve(xml);
            };
            this.pending.set(editorId, { token, settle });
            const timer = setTimeout(() => settle(undefined), timeoutMs);
            // postMessage can reject (hidden VS Code webview throws "The active
            // editor is hidden.") or throw synchronously (requireHandle for an
            // already-gone editor). Both mean nothing to flush — never rejects.
            try {
                void this.editorStore
                    .postMessage(editorId, new FlushDocumentQuery(token))
                    .catch(() => settle(undefined));
            } catch {
                settle(undefined);
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
        entry.settle(command.content);
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
