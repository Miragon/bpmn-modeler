import { DmnFileQuery } from "@miragon/bpmn-modeler-shared";

import { ModelerSession } from "../../../shared/domain/session";
import { isHiddenEditorError, UserCancelledError } from "../../../shared/domain/errors";
import { DocumentPort, NotifierPort } from "../../../shared/domain/hostPorts";
import { EditorSessionStore } from "../../../shared/infrastructure/EditorSessionStore";
import { EMPTY_DMN_DIAGRAM } from "../domain/emptyDmn";

export class DmnModelerService {
    private readonly sessions: Map<string, ModelerSession> = new Map();

    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly vsDocument: DocumentPort,
        private readonly notifier: NotifierPort,
    ) {}

    registerSession(editorId: string): void {
        this.sessions.set(editorId, new ModelerSession(editorId));
    }

    disposeSession(editorId: string): void {
        this.sessions.delete(editorId);
    }

    async display(editorId: string, hostUpdated = false): Promise<boolean> {
        try {
            const session = this.sessions.get(editorId);
            let dmnFile = this.vsDocument.getContent(editorId);
            if (session?.isGuarded(dmnFile)) return false;
            if (hostUpdated) this.editorStore.markHostDocumentUpdated(editorId);
            const documentRevision = this.editorStore.currentHostDocumentRevision(editorId);

            if (dmnFile === "") {
                dmnFile = EMPTY_DMN_DIAGRAM;
                session?.acquireGuard(dmnFile);
                try {
                    await this.vsDocument.write(editorId, dmnFile, documentRevision);
                } finally {
                    session?.releaseGuard(dmnFile);
                }
                await this.vsDocument.save(editorId);
            }

            return await this.editorStore.postMessage(
                editorId,
                new DmnFileQuery(dmnFile, documentRevision),
            );
        } catch (error) {
            if (error instanceof UserCancelledError) {
                return false;
            }
            if (isHiddenEditorError(error)) {
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
        // Guard around the write so the resulting document-change event is
        // recognised as our own echo and not re-rendered.
        session?.acquireGuard(content);
        try {
            return await this.vsDocument.write(editorId, content, documentRevision);
        } catch (error) {
            return this.handleSyncError(error as Error);
        } finally {
            session?.releaseGuard(content);
        }
    }

    private handleError(error: Error): boolean {
        this.notifier.logError(error);
        this.notifier.showError(
            `A problem occurred while trying to display the DMN Modeler.\n${error.message ?? error}`,
        );
        return false;
    }

    private handleSyncError(error: Error): boolean {
        this.notifier.logError(error);
        this.notifier.showError(
            `A problem occurred while trying to sync the DMN file.\n${error.message}`,
        );
        return false;
    }
}
