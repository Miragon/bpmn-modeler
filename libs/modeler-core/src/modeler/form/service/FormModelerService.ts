import { FormFileQuery } from "@miragon/bpmn-modeler-shared";

import { isHiddenEditorError, UserCancelledError } from "../../../shared/domain/errors";
import { DocumentPort, NotifierPort } from "../../../shared/domain/hostPorts";
import { EditorDocumentSync } from "../../../shared/infrastructure/EditorDocumentSync";
import { EditorSessionStore } from "../../../shared/infrastructure/EditorSessionStore";
import { createEmptyForm } from "../domain/emptyForm";

export class FormModelerService {
    private readonly documents: EditorDocumentSync;

    constructor(
        private readonly editorStore: EditorSessionStore,
        document: DocumentPort,
        private readonly notifier: NotifierPort,
    ) {
        this.documents = new EditorDocumentSync(editorStore, document);
    }

    registerSession(editorId: string): void {
        this.documents.register(editorId);
    }

    disposeSession(editorId: string): void {
        this.documents.dispose(editorId);
    }

    async display(editorId: string, hostUpdated = false): Promise<boolean> {
        try {
            const snapshot = this.documents.read(editorId, hostUpdated);
            if (!snapshot) return false;
            let content: string | undefined = snapshot.content;
            if (content === "") {
                content = await this.documents.initializeEmpty(
                    editorId,
                    snapshot,
                    hostUpdated,
                    createEmptyForm,
                );
                if (content === undefined) return false;
            }
            return await this.editorStore.postMessage(
                editorId,
                new FormFileQuery(content, snapshot.revision),
            );
        } catch (error) {
            if (error instanceof UserCancelledError || isHiddenEditorError(error)) {
                return false;
            }
            this.notifier.notifyError(
                "A problem occurred while trying to display the Form Editor.",
                error as Error,
            );
            return false;
        }
    }

    async sync(editorId: string, content: string, documentRevision?: number): Promise<boolean> {
        try {
            return await this.documents.sync(editorId, content, documentRevision);
        } catch (error) {
            this.notifier.notifyError(
                "A problem occurred while trying to sync the form file.",
                error as Error,
            );
            return false;
        }
    }
}
