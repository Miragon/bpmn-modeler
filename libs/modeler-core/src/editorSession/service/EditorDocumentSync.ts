import { ModelerSession } from "../domain/session";
import { DocumentPort } from "../../kernel/domain/hostPorts";
import { EditorSessionStore } from "./EditorSessionStore";

/** The document as one display call found it; async work re-checks it before acting. */
export interface DocumentSnapshot {
    readonly content: string;
    readonly revision: number;
    /** `false` once the editor closed, was replaced, or the host changed the document. */
    isCurrent(): boolean;
}

/** What the shared document handlers and render participant need from a modeler service. */
export interface ModelerDocumentService {
    registerSession(editorId: string): void;
    disposeSession(editorId: string): void;
    display(editorId: string, hostUpdated?: boolean): Promise<boolean>;
    sync(editorId: string, content: string, documentRevision?: number): Promise<boolean>;
}

/**
 * The document synchronisation every modeler editor (BPMN, DMN, Form) shares:
 * echo suppression for the core's own writes, revision-checked syncs, and the
 * one-time initialisation of an empty file. Each modeler service adds only
 * what its document type needs (the empty content, the query it posts).
 */
export class EditorDocumentSync {
    private readonly guards = new Map<string, ModelerSession>();
    private readonly initializations = new Map<string, DocumentSnapshot>();

    constructor(
        private readonly store: EditorSessionStore,
        private readonly document: DocumentPort,
    ) {}

    register(editorId: string): void {
        this.guards.set(editorId, new ModelerSession(editorId));
        this.initializations.delete(editorId);
    }

    dispose(editorId: string): void {
        this.guards.delete(editorId);
        this.initializations.delete(editorId);
    }

    /**
     * Reads the document for display; `undefined` when the content is the echo
     * of the core's own in-flight write and must not re-render.
     */
    read(editorId: string, hostUpdated: boolean): DocumentSnapshot | undefined {
        const content = this.document.getContent(editorId);
        if (this.guards.get(editorId)?.isGuarded(content)) return undefined;
        if (hostUpdated) this.store.markHostDocumentUpdated(editorId);
        return this.snapshot(editorId);
    }

    snapshot(editorId: string): DocumentSnapshot {
        const revision = this.store.currentHostDocumentRevision(editorId);
        const editorSession = this.store.captureEditorSession(editorId);
        return {
            content: this.document.getContent(editorId),
            revision,
            isCurrent: () =>
                editorSession !== undefined &&
                this.store.isCurrentEditorSession(editorId, editorSession) &&
                this.store.isHostDocumentRevisionCurrent(editorId, revision),
        };
    }

    /**
     * Writes and saves the content `create` returns into an empty document.
     * An initialisation in flight blocks another only while its snapshot is
     * current: a webview reload re-requesting the file must not race the first
     * write, but a host change at a newer revision supersedes it. `undefined`
     * when the snapshot went stale or a current initialisation is in flight.
     */
    async initializeEmpty(
        editorId: string,
        snapshot: DocumentSnapshot,
        create: () => string | Promise<string>,
    ): Promise<string | undefined> {
        if (this.initializations.get(editorId)?.isCurrent()) return undefined;
        this.initializations.set(editorId, snapshot);
        try {
            const created = create();
            // A synchronous create must start its write in the same tick, so a
            // display racing it finds the initialisation already in flight.
            const content = typeof created === "string" ? created : await created;
            if (!snapshot.isCurrent()) return undefined;
            const written = await this.writeAndConfirm(editorId, content, snapshot.revision);
            if (!snapshot.isCurrent()) return undefined;
            if (!written) {
                throw new Error("The empty document could not be initialized.");
            }
            await this.document.save(editorId);
            if (!snapshot.isCurrent()) return undefined;
            return content;
        } finally {
            if (this.initializations.get(editorId) === snapshot) {
                this.initializations.delete(editorId);
            }
        }
    }

    /**
     * Applies a webview edit made against `documentRevision`; `false` when the
     * host changed the document since. A write failure propagates.
     */
    async sync(editorId: string, content: string, documentRevision?: number): Promise<boolean> {
        if (!this.store.isHostDocumentRevisionCurrent(editorId, documentRevision)) {
            return false;
        }
        return this.write(editorId, content, documentRevision);
    }

    /**
     * Guards the write so the document-change event it causes is recognised as
     * the core's own echo and not re-rendered.
     */
    async write(editorId: string, content: string, documentRevision?: number): Promise<boolean> {
        const guard = this.guards.get(editorId);
        guard?.acquireGuard(content);
        try {
            return await this.document.write(editorId, content, documentRevision);
        } finally {
            guard?.releaseGuard(content);
        }
    }

    /**
     * Writes like {@link write}, but resolves whether the document holds
     * `content` afterwards: a write the host skipped because the content was
     * already there counts as written, a refused one does not.
     */
    async writeAndConfirm(
        editorId: string,
        content: string,
        documentRevision?: number,
    ): Promise<boolean> {
        if (await this.write(editorId, content, documentRevision)) return true;
        return this.store.hasEditor(editorId) && this.document.getContent(editorId) === content;
    }
}
