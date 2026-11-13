import { FormFileQuery } from "@miragon/bpmn-modeler-shared";
import { isBlankDocument } from "@miragon/bpmn-modeler-types";

import { UserCancelledError } from "../../../kernel/domain/errors";
import { NotifierPort } from "../../../kernel/port/hostPorts";
import { EditorSessionDocuments } from "../../../editorSession/service/EditorSessionDocuments";
import { EditorDocumentSync } from "../../../editorSession/service/EditorDocumentSync";
import { EditorSessionStore } from "../../../editorSession/service/EditorSessionStore";
import { createEmptyForm } from "../domain/emptyForm";
import { FormEngineSelectionPorts, FormEngineSelectionService } from "./FormEngineSelectionService";

export class FormModelerService {
    private readonly documents: EditorDocumentSync;
    private readonly selection: FormEngineSelectionService;

    constructor(
        private readonly editorStore: EditorSessionStore,
        document: EditorSessionDocuments,
        private readonly notifier: NotifierPort,
        selection: FormEngineSelectionPorts,
    ) {
        this.documents = new EditorDocumentSync(editorStore, document);
        this.selection = new FormEngineSelectionService(
            editorStore,
            this.documents,
            notifier,
            selection,
            (id) => this.display(id),
        );
    }

    registerSession(editorId: string): void {
        this.documents.register(editorId);
    }

    disposeSession(editorId: string): void {
        this.documents.dispose(editorId);
    }

    changeEngineVersion(editorId: string): Promise<boolean> {
        return this.selection.changeEngineVersion(editorId);
    }

    async display(editorId: string, hostUpdated = false): Promise<boolean> {
        try {
            const snapshot = this.documents.read(editorId, hostUpdated);
            if (!snapshot) return false;
            let content: string | undefined = snapshot.content;
            if (isBlankDocument(content)) {
                content = await this.documents.initializeEmpty(editorId, snapshot, createEmptyForm);
                if (content === undefined) return false;
            }
            const outcome = await this.editorStore.postUnlessHidden(
                editorId,
                new FormFileQuery(content, snapshot.revision),
            );
            return outcome === "sent";
        } catch (error) {
            if (error instanceof UserCancelledError) {
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
