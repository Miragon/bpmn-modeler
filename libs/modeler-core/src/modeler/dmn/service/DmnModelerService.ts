import { DmnFileQuery } from "@miragon/bpmn-modeler-shared";

import { ModelerSession } from "../../../shared/domain/session";
import { UserCancelledError } from "../../../shared/domain/errors";
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

    async display(editorId: string): Promise<boolean> {
        // Skip echoed document changes caused by our own write.
        const session = this.sessions.get(editorId);
        if (session?.isGuarded()) {
            return false;
        }

        try {
            let dmnFile = this.vsDocument.getContent(editorId);

            if (dmnFile === "") {
                dmnFile = EMPTY_DMN_DIAGRAM;
                await this.vsDocument.write(editorId, dmnFile);
                await this.vsDocument.save(editorId);
            }

            return await this.editorStore.postMessage(editorId, new DmnFileQuery(dmnFile));
        } catch (error) {
            if (error instanceof UserCancelledError) {
                return false;
            }
            if (error instanceof Error && error.message === "The active editor is hidden.") {
                return false;
            }
            return this.handleError(error as Error);
        }
    }

    async sync(editorId: string, content: string): Promise<boolean> {
        const session = this.sessions.get(editorId);
        // Guard around the write so the resulting document-change event is
        // recognised as our own echo and not re-rendered.
        session?.acquireGuard();
        try {
            return await this.vsDocument.write(editorId, content);
        } catch (error) {
            return this.handleSyncError(error as Error);
        } finally {
            session?.releaseGuard();
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
