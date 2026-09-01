import {
    DocumentFlushedCommand,
    FlushDocumentQuery,
    ReleaseDocumentFlushQuery,
} from "./messages";

/**
 * The webview-side capabilities the flush responder drives, named in domain
 * terms so every modeler webview can supply them without the
 * responder importing either modeler. Kept as a tiny port so the responder is
 * unit-testable from the `shared` vitest project — the DMN webview has no
 * vitest project of its own, so covering the shared responder is how the DMN
 * flush path gets tested at all.
 */
export interface FlushSource {
    /** Whether the modeler has finished bootstrapping (`modelerIsInitialized`). */
    isReady(): boolean;
    /** Whether a debounced sync is scheduled or in flight (`debouncedSend.pending()`). */
    hasPendingSync(): boolean;
    /** Whether host-authoritative content is waiting to finish importing. */
    hasPendingHostUpdate(): boolean;
    /** Monotonic generation incremented as each host update arrives. */
    hostUpdateVersion(): number;
    /** Revision of the host document currently represented by the modeler. */
    documentRevision(): number;
    /** Forces the normal sync path now and waits until it settles. */
    flushPendingSync(): Promise<void>;
    /** Prevents user mutations before destructive teardown inspects pending work. */
    beginDestructiveFlush(): void;
    /** Restores interaction when the host declines the destructive action. */
    endDestructiveFlush(): void;
    /** Exports the current full-document content. */
    exportContent(): Promise<string>;
}

/**
 * Builds the webview handler for a {@link FlushDocumentQuery}. It reconciles the
 * outbound sync debounce with the host's save/close path so a persist never
 * writes stale content, resting on two properties of this system:
 *
 * - **the normal sync remains a fallback.** A save leaves its debounce armed;
 *   a destructive flush locks interaction and drains that debounce before
 *   exporting. In either case a lost reply cannot strand the only copy of an edit.
 * - **the pending gates protect host-authoritative content.** The webview model
 *   can lag the host buffer while a raw source edit is importing. Export is
 *   allowed only for a pending outbound edit and never while an inbound host
 *   update is in flight; otherwise the host copy wins with a `clean` reply.
 *
 * A `token` echoes the query so the host can match/expire replies. The explicit
 * status distinguishes known-clean, exported, and unavailable modelers without
 * forcing the host to wait for a timeout.
 */
export function createFlushResponder(
    source: FlushSource,
    post: (reply: DocumentFlushedCommand) => void,
): (query: FlushDocumentQuery | ReleaseDocumentFlushQuery) => Promise<void> {
    let lockedToken: number | undefined;

    const release = (token: number): void => {
        if (lockedToken !== token) return;
        lockedToken = undefined;
        source.endDestructiveFlush();
    };

    return async (query: FlushDocumentQuery | ReleaseDocumentFlushQuery): Promise<void> => {
        if (query.type === "ReleaseDocumentFlushQuery") {
            release(query.token);
            return;
        }
        const flush = query as FlushDocumentQuery;
        if (!source.isReady()) {
            post(new DocumentFlushedCommand(flush.token, undefined, "unavailable"));
            return;
        }
        let hostUpdateVersion = source.hostUpdateVersion();
        const hostUpdated = (): boolean =>
            source.hasPendingHostUpdate() || source.hostUpdateVersion() !== hostUpdateVersion;
        if (!flush.destructive && (hostUpdated() || !source.hasPendingSync())) {
            post(
                new DocumentFlushedCommand(
                    flush.token,
                    undefined,
                    hostUpdated() ? "host-updated" : "clean",
                ),
            );
            return;
        }

        try {
            if (flush.destructive) {
                if (lockedToken !== undefined) release(lockedToken);
                lockedToken = flush.token;
                source.beginDestructiveFlush();
                hostUpdateVersion = source.hostUpdateVersion();
                if (hostUpdated() || (!source.hasPendingSync() && !flush.exportWhenClean)) {
                    post(
                        new DocumentFlushedCommand(
                            flush.token,
                            undefined,
                            hostUpdated() ? "host-updated" : "clean",
                        ),
                    );
                    return;
                }
                await source.flushPendingSync();
                if (hostUpdated()) {
                    post(new DocumentFlushedCommand(flush.token, undefined, "host-updated"));
                    return;
                }
            }
            const content = await source.exportContent();
            if (hostUpdated()) {
                post(new DocumentFlushedCommand(flush.token, undefined, "host-updated"));
                return;
            }
            post(
                new DocumentFlushedCommand(
                    flush.token,
                    content,
                    "flushed",
                    source.documentRevision(),
                ),
            );
        } catch {
            if (hostUpdated()) {
                post(new DocumentFlushedCommand(flush.token, undefined, "host-updated"));
                return;
            }
            if (flush.destructive) {
                release(flush.token);
            } else {
                try {
                    await source.flushPendingSync();
                } catch {
                    // The explicit unavailable result still prevents teardown.
                }
            }
            post(new DocumentFlushedCommand(flush.token, undefined, "unavailable"));
        }
    };
}
