import {
    DocumentFlushedCommand,
    FlushDocumentQuery,
    ReleaseDocumentFlushQuery,
} from "@miragon/bpmn-modeler-shared";

import { NotifierPort } from "../domain/hostPorts";
import { EditorSessionStore } from "../infrastructure/EditorSessionStore";
import { MessageHandler } from "../infrastructure/WebviewMessageRouter";

export type DocumentFlushResult =
    | { status: "clean" }
    | { status: "flushed"; content: string; documentRevision?: number }
    | { status: "host-updated" }
    | { status: "unavailable" };

type PendingFlush = {
    token: number;
    session: object;
    destructive: boolean;
    promise: Promise<DocumentFlushResult>;
    settle(result: DocumentFlushResult): void;
};

export interface DocumentFlushOptions {
    timeoutMs?: number;
    destructive?: boolean;
}

/**
 * Host-side half of the flush protocol: round-trips a {@link FlushDocumentQuery}
 * to a webview and resolves with the content the webview flushes back, so a
 * save/reload path can persist the freshest document instead of racing the
 * webview's outbound sync debounce.
 *
 * Host-agnostic by construction — it names only `setTimeout`, the shared
 * messages, the editor store, and the logger port. `requestFlush` **never rejects**:
 * every failure mode resolves an `unavailable` result. A matching reply without
 * content is a distinct `clean` result, so destructive callers can require a
 * confirmed flush while save paths remain best-effort. A persistence caller
 * must still drain the editor's task queue: a sync posted immediately before a
 * clean reply may still be applying to the host document.
 */
export class DocumentFlushService {
    private nextToken = 1;

    /**
     * Concurrent requests for one editor session share a single round-trip. A
     * replacement session with the same editor id invalidates the old request
     * and starts its own. `token` disambiguates late replies.
     */
    private readonly pending = new Map<string, PendingFlush>();
    private readonly locked = new Map<string, { token: number; session: object }>();

    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly notifier: NotifierPort,
    ) {}

    /**
     * Asks the webview owning `editorId` to flush. Concurrent callers for the
     * same session share one promise. A destructive request supersedes a normal
     * one because only the former establishes the mutation lock reload requires.
     */
    requestFlush(
        editorId: string,
        options: DocumentFlushOptions = {},
    ): Promise<DocumentFlushResult> {
        const { timeoutMs = 500, destructive = false } = options;
        const session = this.editorStore.captureEditorSession(editorId);
        if (!session) {
            return Promise.resolve({ status: "unavailable" });
        }
        const heldLock = this.locked.get(editorId);
        if (heldLock && heldLock.session !== session) {
            this.locked.delete(editorId);
        } else if (heldLock && destructive) {
            this.releaseFlush(editorId, session);
        }
        const existing = this.pending.get(editorId);
        if (existing?.session === session && (existing.destructive || !destructive)) {
            return existing.promise;
        }
        existing?.settle({ status: "unavailable" });

        let resolveRequest!: (result: DocumentFlushResult) => void;
        let settled = false;
        const token = this.nextToken++;
        const promise = new Promise<DocumentFlushResult>((resolve) => {
            resolveRequest = resolve;
        });
        const settle = (result: DocumentFlushResult): void => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (this.pending.get(editorId)?.token === token) {
                this.pending.delete(editorId);
            }
            if (destructive && result.status === "unavailable") {
                this.postRelease(editorId, session, token);
            }
            resolveRequest(result);
        };
        this.pending.set(editorId, { token, session, destructive, promise, settle });
        const timer = setTimeout(() => settle({ status: "unavailable" }), timeoutMs);
        try {
            void this.editorStore
                .postMessage(editorId, new FlushDocumentQuery(token, destructive))
                .then(
                    (delivered) => {
                        if (!delivered) settle({ status: "unavailable" });
                    },
                    () => settle({ status: "unavailable" }),
                );
        } catch {
            settle({ status: "unavailable" });
        }
        return promise;
    }

    /** Releases a mutation lock held by a successful destructive flush. */
    releaseFlush(editorId: string, session: object): void {
        const lock = this.locked.get(editorId);
        if (!lock || lock.session !== session) return;
        this.locked.delete(editorId);
        this.postRelease(editorId, session, lock.token);
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
        const status = command.status ?? (command.content === undefined ? "clean" : "flushed");
        const result: DocumentFlushResult =
            status === "unavailable"
                ? { status: "unavailable" }
                : status === "flushed" && command.content !== undefined
                  ? command.documentRevision === undefined
                      ? { status: "flushed", content: command.content }
                      : {
                            status: "flushed",
                            content: command.content,
                            documentRevision: command.documentRevision,
                        }
                  : status === "host-updated"
                    ? { status: "host-updated" }
                    : status === "clean"
                      ? { status: "clean" }
                      : { status: "unavailable" };
        if (entry.destructive && result.status !== "unavailable") {
            this.locked.set(editorId, { token: entry.token, session: entry.session });
        }
        entry.settle(result);
    }

    private postRelease(editorId: string, session: object, token: number): void {
        if (!this.editorStore.isCurrentEditorSession(editorId, session)) return;
        try {
            void this.editorStore
                .postMessage(editorId, new ReleaseDocumentFlushQuery(token))
                .catch(() => undefined);
        } catch {
            // The editor may be disposing; there is then no live webview to unlock.
        }
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
