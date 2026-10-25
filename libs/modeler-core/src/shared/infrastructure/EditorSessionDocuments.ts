import { DocumentPort } from "../domain/hostPorts";
import { EditorSessionStore } from "./EditorSessionStore";

/**
 * {@link DocumentPort} adapter: routes an `editorId` to the owning
 * {@link EditorHandle} and delegates the actual document I/O to it.
 *
 * Every method takes an explicit `editorId` so operations always reach the
 * correct document when editors are open side-by-side — avoiding the split-view
 * white-screen bug that occurred when I/O implicitly routed through the active
 * editor. Host specifics such as scheme guards and the actual document edit
 * live on the handle, the only holder of the host's document.
 */
export class EditorSessionDocuments implements DocumentPort {
    constructor(private readonly editorStore: EditorSessionStore) {}

    getContent(editorId: string): string {
        return this.editorStore.requireHandle(editorId).getContent();
    }

    getFilePath(editorId: string): string {
        return this.editorStore.requireHandle(editorId).documentPath();
    }

    /** @returns `true` if the edit was applied, `false` if content was unchanged. */
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

    save(editorId: string): Promise<boolean> {
        return this.editorStore.requireHandle(editorId).save();
    }
}
