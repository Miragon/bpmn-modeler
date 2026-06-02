import { DocumentPort } from "../domain/hostPorts";
import { EditorSessionStore } from "./EditorSessionStore";

/**
 * {@link DocumentPort} adapter: routes an `editorId` to the owning
 * {@link EditorHandle} and delegates the actual document I/O to it.
 *
 * Every method takes an explicit `editorId` so operations always reach the
 * correct document when editors are open side-by-side — avoiding the split-view
 * white-screen bug that occurred when I/O implicitly routed through the active
 * editor. The scheme guards and `WorkspaceEdit` mechanics live on the handle,
 * the only holder of the concrete `TextDocument`.
 */
export class VsCodeDocument implements DocumentPort {
    constructor(private readonly editorStore: EditorSessionStore) {}

    getContent(editorId: string): string {
        return this.editorStore.requireHandle(editorId).getContent();
    }

    getFilePath(editorId: string): string {
        return this.editorStore.requireHandle(editorId).documentPath();
    }

    /** @returns `true` if the edit was applied, `false` if content was unchanged. */
    write(editorId: string, content: string): Promise<boolean> {
        return this.editorStore.requireHandle(editorId).writeContent(content);
    }

    save(editorId: string): Promise<boolean> {
        return this.editorStore.requireHandle(editorId).save();
    }
}
