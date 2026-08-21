import { DocumentFlushedCommand, FlushDocumentQuery } from "./messages";

/**
 * The webview-side capabilities the flush responder drives, named in domain
 * terms so both the BPMN and DMN `main.ts` can supply them without the
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
    /** Drops the scheduled sync so it cannot fire after the flush and double-write. */
    cancelPendingSync(): void;
    /** Exports the current full-document XML (`exportDiagram()` / `saveXML()`). */
    exportXml(): Promise<string>;
}

/**
 * Builds the webview handler for a {@link FlushDocumentQuery}. It reconciles the
 * outbound sync debounce with the host's save/close path so a persist never
 * writes stale XML, resting on two properties of this system:
 *
 * - **cancel-and-carry is safe.** Every sync is a full-document snapshot, so
 *   cancelling the pending debounced sync and returning the XML in the reply
 *   loses nothing — a missed sync would have self-healed on the next model
 *   change anyway, and here we hand the host the exact same bytes directly.
 * - **the `pending()` gate protects host-authoritative content.** The webview
 *   model can lag the host buffer (e.g. a raw-XML side-by-side edit re-imported
 *   into the webview). If we exported unconditionally, a stale webview model
 *   would clobber that just-made host edit at save time. Gating on
 *   `hasPendingSync()` means we only ever recover the window the debounce
 *   itself introduced; when nothing is pending the host copy already wins.
 *
 * A `token` echoes the query so the host can match/expire replies. An
 * `undefined` `content` (not ready, nothing pending, or export threw) tells the
 * host to leave its buffer untouched.
 */
export function createFlushResponder(
    source: FlushSource,
    post: (reply: DocumentFlushedCommand) => void,
): (query: FlushDocumentQuery) => Promise<void> {
    return async (query: FlushDocumentQuery): Promise<void> => {
        if (!source.isReady() || !source.hasPendingSync()) {
            post(new DocumentFlushedCommand(query.token, undefined));
            return;
        }

        // Drop the scheduled sync first so it can't fire after we export and
        // race a second write of the same snapshot into the host.
        source.cancelPendingSync();
        try {
            post(new DocumentFlushedCommand(query.token, await source.exportXml()));
        } catch {
            // Export can throw (e.g. DMN before the first diagram loads); treat
            // it as nothing-to-flush so the host keeps its own buffer.
            post(new DocumentFlushedCommand(query.token, undefined));
        }
    };
}
