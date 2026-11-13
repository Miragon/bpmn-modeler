import { EditorSessionStore } from "./EditorSessionStore";

/**
 * The open editors' documents, addressed by `editorId`: routes each call to
 * the editor's {@link EditorHandle}, the only holder of the host's document.
 *
 * Every method takes an explicit `editorId` so operations always reach the
 * correct document when editors are open side-by-side — avoiding the split-view
 * white-screen bug that occurred when I/O implicitly routed through the active
 * editor.
 */
export class EditorSessionDocuments {
    constructor(private readonly editorStore: EditorSessionStore) {}

    /** @throws for an editor the store does not hold. */
    getContent(editorId: string): string {
        return this.editorStore.requireHandle(editorId).getContent();
    }

    /** The editor's `EditorHandle.documentPath`: `/`-separated, so callers take `posix.dirname` of it. */
    getFilePath(editorId: string): string {
        return this.editorStore.requireHandle(editorId).documentPath();
    }

    /**
     * @returns `true` if applied; `false` if the content was unchanged or the
     * write was refused (a stale revision, a replaced session, a failed edit).
     * Only {@link getContent} tells the two apart.
     */
    write(editorId: string, content: string, expectedDocumentRevision?: number): Promise<boolean> {
        if (
            expectedDocumentRevision !== undefined &&
            !this.editorStore.isHostDocumentRevisionCurrent(editorId, expectedDocumentRevision)
        ) {
            return Promise.resolve(false);
        }
        return this.editorStore
            .requireHandle(editorId)
            .writeContent(content, expectedDocumentRevision);
    }

    /**
     * @returns `true` when the document is saved or had nothing to save; `false`
     * when the host could not save it.
     */
    save(editorId: string): Promise<boolean> {
        return this.editorStore.requireHandle(editorId).save();
    }
}
