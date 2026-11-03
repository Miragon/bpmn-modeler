import { DocumentWriteResult, SessionMeta } from "../../protocol/domain/types";

/**
 * Local mirror of every open document's text + identity, seeded by the host on
 * `session/register`, refreshed on external `document/didChange` and on every
 * acknowledged core `document/write`. Exists solely to make the core's
 * synchronous `getContent()` work without a blocking RPC round-trip.
 */
export class DocumentMirror {
    private readonly meta = new Map<string, SessionMeta>();
    private readonly text = new Map<string, string>();
    private readonly contentListeners = new Set<(editorId: string) => void>();

    register(meta: SessionMeta, content: string): void {
        this.meta.set(meta.editorId, meta);
        this.text.set(meta.editorId, content);
    }

    setContent(editorId: string, content: string): void {
        this.text.set(editorId, content);
        this.contentListeners.forEach((listener) => listener(editorId));
    }

    /** Fires after any mirrored content update, so features can react to edits. */
    onDidChangeContent(listener: (editorId: string) => void): { dispose(): void } {
        this.contentListeners.add(listener);
        return { dispose: () => this.contentListeners.delete(listener) };
    }

    content(editorId: string): string {
        return this.text.get(editorId) ?? "";
    }

    /**
     * Applies the outcome of a core `document/write`. The host sends no
     * `document/didChange` echo for its own write, so the reply is the only
     * signal that the Document now holds these bytes. A reply for a replaced
     * session generation must not overwrite the current session's text.
     */
    completeWrite(
        editorId: string,
        sessionId: number | undefined,
        writtenContent: string,
        result: DocumentWriteResult | null,
    ): boolean {
        const changed = result?.accepted !== false && result?.changed === true;
        if (changed && this.meta.get(editorId)?.sessionId === sessionId) {
            this.setContent(editorId, result?.normalizedContent ?? writtenContent);
        }
        return changed;
    }

    require(editorId: string): SessionMeta {
        const meta = this.meta.get(editorId);
        if (!meta) {
            throw new Error(`No session metadata for editor: ${editorId}`);
        }
        return meta;
    }

    /** Non-throwing metadata lookup for teardown paths that tolerate absence. */
    peek(editorId: string): SessionMeta | undefined {
        return this.meta.get(editorId);
    }

    remove(editorId: string): void {
        this.meta.delete(editorId);
        this.text.delete(editorId);
    }
}
