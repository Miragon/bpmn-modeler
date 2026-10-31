import { ElementTemplateFileQuery } from "@miragon/bpmn-modeler-shared";

import { isHiddenEditorError } from "../../../kernel/domain/errors";
import { DocumentPort, NotifierPort, SettingsPort } from "../../../kernel/domain/hostPorts";
import {
    EditorDocumentSync,
    ModelerDocumentService,
} from "../../../editorSession/service/EditorDocumentSync";
import { EditorSessionStore } from "../../../editorSession/service/EditorSessionStore";

/**
 * Feeds an element-template file to its editor and writes the editor's edits
 * back. The text goes out as it is, empty or broken, because the editor
 * explains what it cannot show.
 */
export class ElementTemplateEditorService implements ModelerDocumentService {
    private readonly documents: EditorDocumentSync;

    constructor(
        private readonly editorStore: EditorSessionStore,
        document: DocumentPort,
        private readonly settings: Pick<SettingsPort, "getLanguage">,
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
            return await this.editorStore.postMessage(
                editorId,
                new ElementTemplateFileQuery(
                    snapshot.content,
                    snapshot.revision,
                    this.settings.getLanguage(),
                ),
            );
        } catch (error) {
            if (isHiddenEditorError(error)) {
                return false;
            }
            this.notifier.notifyError(
                "A problem occurred while trying to display the element template preview.",
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
                "A problem occurred while trying to save the element template.",
                error as Error,
            );
            return false;
        }
    }
}
