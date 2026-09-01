import { FormFileQuery } from "@miragon/bpmn-modeler-shared";

import { isHiddenEditorError, UserCancelledError } from "../../../shared/domain/errors";
import { DocumentPort, NotifierPort } from "../../../shared/domain/hostPorts";
import { ModelerSession } from "../../../shared/domain/session";
import { EditorSessionStore } from "../../../shared/infrastructure/EditorSessionStore";
import { createEmptyForm } from "../domain/emptyForm";

export class FormModelerService {
    private readonly sessions = new Map<string, ModelerSession>();
    private readonly initializations = new Map<string, object>();

    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly document: DocumentPort,
        private readonly notifier: NotifierPort,
    ) {}

    registerSession(editorId: string): void {
        this.sessions.set(editorId, new ModelerSession(editorId));
        this.initializations.delete(editorId);
    }

    disposeSession(editorId: string): void {
        this.sessions.delete(editorId);
        this.initializations.delete(editorId);
    }

    async display(editorId: string, hostUpdated = false): Promise<boolean> {
        try {
            const session = this.sessions.get(editorId);
            let content = this.document.getContent(editorId);
            if (session?.isGuarded(content)) return false;
            if (hostUpdated) this.editorStore.markHostDocumentUpdated(editorId);
            const documentRevision = this.editorStore.currentHostDocumentRevision(editorId);
            const editorSession = this.editorStore.captureEditorSession(editorId);
            if (content === "") {
                if (!hostUpdated && this.initializations.has(editorId)) return false;
                const initialization = {};
                this.initializations.set(editorId, initialization);
                try {
                    content = createEmptyForm();
                    session?.acquireGuard(content);
                    let changed: boolean;
                    try {
                        changed = await this.document.write(editorId, content, documentRevision);
                    } finally {
                        session?.releaseGuard(content);
                    }
                    if (!this.isSnapshotCurrent(editorId, editorSession, documentRevision))
                        return false;
                    if (!changed && this.document.getContent(editorId) !== content) {
                        return this.handleError(
                            new Error("The empty form could not be initialized."),
                        );
                    }
                    await this.document.save(editorId);
                    if (!this.isSnapshotCurrent(editorId, editorSession, documentRevision))
                        return false;
                } finally {
                    if (this.initializations.get(editorId) === initialization) {
                        this.initializations.delete(editorId);
                    }
                }
            }
            return await this.editorStore.postMessage(
                editorId,
                new FormFileQuery(content, documentRevision),
            );
        } catch (error) {
            if (error instanceof UserCancelledError || isHiddenEditorError(error)) {
                return false;
            }
            return this.handleError(error as Error);
        }
    }

    async sync(editorId: string, content: string, documentRevision?: number): Promise<boolean> {
        const session = this.sessions.get(editorId);
        if (!this.editorStore.isHostDocumentRevisionCurrent(editorId, documentRevision)) {
            return false;
        }
        session?.acquireGuard(content);
        try {
            return await this.document.write(editorId, content, documentRevision);
        } catch (error) {
            this.notifier.notifyError(
                "A problem occurred while trying to sync the form file.",
                error as Error,
            );
            return false;
        } finally {
            session?.releaseGuard(content);
        }
    }

    private handleError(error: Error): boolean {
        this.notifier.notifyError(
            "A problem occurred while trying to display the Form Editor.",
            error,
        );
        return false;
    }

    private isSnapshotCurrent(
        editorId: string,
        editorSession: object | undefined,
        documentRevision: number,
    ): boolean {
        return (
            editorSession !== undefined &&
            this.editorStore.isCurrentEditorSession(editorId, editorSession) &&
            this.editorStore.isHostDocumentRevisionCurrent(editorId, documentRevision)
        );
    }
}
