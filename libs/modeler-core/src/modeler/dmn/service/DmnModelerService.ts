import { DmnFileQuery } from "@miragon/bpmn-modeler-shared";
import { EMPTY_DMN_DIAGRAM, isBlankDocument } from "@miragon/bpmn-modeler-types";

import { UserCancelledError } from "../../../kernel/domain/errors";
import { NotifierPort } from "../../../kernel/port/hostPorts";
import { EditorSessionDocuments } from "../../../editorSession/service/EditorSessionDocuments";
import { EditorDocumentSync } from "../../../editorSession/service/EditorDocumentSync";
import { EditorSessionStore } from "../../../editorSession/service/EditorSessionStore";

export class DmnModelerService {
    private readonly documents: EditorDocumentSync;

    constructor(
        private readonly editorStore: EditorSessionStore,
        document: EditorSessionDocuments,
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
            if (isBlankDocument(content)) {
                content = await this.documents.initializeEmpty(
                    editorId,
                    snapshot,
                    () => EMPTY_DMN_DIAGRAM,
                );
                if (content === undefined) return false;
            }
            const outcome = await this.editorStore.postUnlessHidden(
                editorId,
                new DmnFileQuery(content, snapshot.revision),
            );
            return outcome === "sent";
        } catch (error) {
            if (error instanceof UserCancelledError) {
                return false;
            }
            this.notifier.notifyError(
                "A problem occurred while trying to display the DMN Modeler.",
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
                "A problem occurred while trying to sync the DMN file.",
                error as Error,
            );
            return false;
        }
    }
}
