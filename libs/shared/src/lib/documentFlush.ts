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
    /** Commits a focused properties editor before inspecting the sync debounce. */
    prepareFlush(): Promise<void>;
    /** Whether a debounced sync is scheduled or in flight (`debouncedSend.pending()`). */
    hasPendingSync(): boolean;
    /** Exports the current full-document XML (`exportDiagram()` / `saveXML()`). */
    exportXml(): Promise<string>;
}

/**
 * Blurs a focused editor so properties-panel state reaches the model before it
 * is exported. The task boundary lets reactive blur handlers finish first.
 */
export async function commitActiveEditor(document: Document): Promise<void> {
    const activeElement = document.activeElement as HTMLElement | null;
    if (
        !activeElement?.matches(
            'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
        ) ||
        typeof activeElement.blur !== "function"
    ) {
        return;
    }

    activeElement.blur();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/**
 * Builds the webview handler for a {@link FlushDocumentQuery}. It reconciles the
 * outbound sync debounce with the host's save/close path so a persist never
 * writes stale XML, resting on these properties of this system:
 *
 * - **the `pending()` gate protects host-authoritative content.** The webview
 *   model can lag the host buffer (e.g. a raw-XML side-by-side edit re-imported
 *   into the webview). If we exported unconditionally, a stale webview model
 *   would clobber that just-made host edit at save time. Gating on
 *   `hasPendingSync()` means we only ever recover the window the debounce
 *   itself introduced; when nothing is pending the host copy already wins.
 *
 * The original debounced sync remains scheduled as a fallback until the host has
 * positively applied the reply. Duplicate full snapshots are byte-identical and
 * the host write path no-ops them.
 */
export function createFlushResponder(
    source: FlushSource,
    post: (reply: DocumentFlushedCommand) => void,
): (query: FlushDocumentQuery) => Promise<void> {
    return async (query: FlushDocumentQuery): Promise<void> => {
        if (!source.isReady()) {
            post(new DocumentFlushedCommand(query.token, { status: "idle" }));
            return;
        }

        try {
            await source.prepareFlush();
            if (!source.hasPendingSync()) {
                post(new DocumentFlushedCommand(query.token, { status: "idle" }));
                return;
            }

            post(
                new DocumentFlushedCommand(query.token, {
                    status: "flushed",
                    content: await source.exportXml(),
                }),
            );
        } catch {
            post(new DocumentFlushedCommand(query.token, { status: "failed" }));
        }
    };
}
