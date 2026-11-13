import { DocumentWriteParams, DocumentWriteResult } from "../protocol/domain/types";

/** One open editor's Document as the IntelliJ host holds it. */
export interface IntellijDocument {
    readonly sessionId: number;
    readonly text: string;
    /** The outside edits the host counted and sent to the core. */
    readonly documentRevision: number;
}

export interface IntellijWriteAnswer {
    readonly result: DocumentWriteResult;
    /** What the Document holds after the write. */
    readonly text: string;
}

/**
 * Answers `document/write` as `EditorSessionRouter.kt` does: a write for
 * another session or at another revision than the Document's is refused;
 * otherwise the Document stores LF line endings and the write reports a change
 * only when the text differs, with the stored text when it is not the written
 * one. `EditorSessionRouterTest` runs `intellijDocumentWrite.cases.json`, which
 * this answers too. It leaves out the refusal of a write without a revision
 * while a host change has not reached the webview: a loopback has no webview.
 */
export function intellijDocumentWrite(
    document: IntellijDocument,
    { sessionId, content: written, expectedDocumentRevision }: Omit<DocumentWriteParams, "editorId">,
): IntellijWriteAnswer {
    const refused =
        (sessionId !== undefined && sessionId !== document.sessionId) ||
        (expectedDocumentRevision !== undefined &&
            expectedDocumentRevision !== document.documentRevision);
    if (refused) return { result: { changed: false, accepted: false }, text: document.text };
    const stored = written.replace(/\r\n?/g, "\n");
    const changed = document.text !== stored;
    return {
        result: {
            changed,
            accepted: true,
            normalizedContent: changed && stored !== written ? stored : undefined,
        },
        text: stored,
    };
}
